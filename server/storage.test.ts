import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  sendMock,
  getSignedUrlMock,
  getTenantByIdMock,
  getTenantStorageBytesMock,
  recordStorageObjectMock,
} = vi.hoisted(() => ({
  sendMock: vi.fn(),
  getSignedUrlMock: vi.fn(),
  getTenantByIdMock: vi.fn(),
  getTenantStorageBytesMock: vi.fn(),
  recordStorageObjectMock: vi.fn(),
}));

vi.mock("@aws-sdk/client-s3", () => {
  class S3Client {
    config: unknown;
    send = sendMock;
    constructor(config: unknown) {
      this.config = config;
    }
  }
  class PutObjectCommand {
    constructor(public input: unknown) {}
  }
  class GetObjectCommand {
    constructor(public input: unknown) {}
  }
  return { S3Client, PutObjectCommand, GetObjectCommand };
});

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: getSignedUrlMock,
}));

vi.mock("./db", () => ({
  getTenantById: getTenantByIdMock,
  getTenantStorageBytes: getTenantStorageBytesMock,
  recordStorageObject: recordStorageObjectMock,
}));

import {
  storagePut,
  storageGet,
  storageGetSignedUrl,
  StorageQuotaError,
} from "./storage";
import { storageBytesForPlan } from "@shared/platform";

const ENV_KEYS = [
  "S3_REGION",
  "S3_ENDPOINT",
  "S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_PUBLIC_URL",
];

describe("storage", () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {};
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    sendMock.mockReset().mockResolvedValue({});
    getSignedUrlMock.mockReset().mockResolvedValue("https://signed.example/x");
    // Default: a Free tenant using nothing, so existing cases exercise the
    // upload path rather than the quota.
    getTenantByIdMock.mockReset().mockResolvedValue({ id: 1, plan: "free" });
    getTenantStorageBytesMock.mockReset().mockResolvedValue(0);
    recordStorageObjectMock.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  describe("storagePut", () => {
    it("uploads a buffer and returns a hashed key + proxy URL", async () => {
      process.env.S3_BUCKET = "my-bucket";
      const result = await storagePut(1, "images/cat.png", Buffer.from("hi"));

      expect(sendMock).toHaveBeenCalledTimes(1);
      const cmd = sendMock.mock.calls[0][0] as {
        input: Record<string, unknown>;
      };
      expect(cmd.input.Bucket).toBe("my-bucket");
      // hash suffix inserted before the extension
      expect(result.key).toMatch(/^images\/cat_[0-9a-f]{8}\.png$/);
      expect(cmd.input.Key).toBe(result.key);
      expect(result.url).toBe(`/uploads/${result.key}`);
    });

    it("converts string bodies to a Buffer", async () => {
      process.env.S3_BUCKET = "b";
      await storagePut(1, "notes.txt", "plain text", "text/plain");
      const cmd = sendMock.mock.calls[0][0] as {
        input: Record<string, unknown>;
      };
      expect(Buffer.isBuffer(cmd.input.Body)).toBe(true);
      expect((cmd.input.Body as Buffer).toString()).toBe("plain text");
      expect(cmd.input.ContentType).toBe("text/plain");
    });

    it("appends the hash without an extension when the key has no dot", async () => {
      process.env.S3_BUCKET = "b";
      const result = await storagePut(1, "rawkey", Buffer.from(""));
      expect(result.key).toMatch(/^rawkey_[0-9a-f]{8}$/);
    });

    it("strips leading slashes from the key", async () => {
      process.env.S3_BUCKET = "b";
      const result = await storagePut(1, "///deep/file.jpg", Buffer.from(""));
      expect(result.key.startsWith("deep/")).toBe(true);
    });

    it("uses the public base URL when configured", async () => {
      process.env.S3_BUCKET = "b";
      process.env.S3_PUBLIC_URL = "https://cdn.example.com/";
      const result = await storagePut(1, "a.png", Buffer.from(""));
      expect(result.url).toBe(`https://cdn.example.com/${result.key}`);
    });

    it("throws when the bucket is not configured", async () => {
      await expect(storagePut(1, "a.png", Buffer.from(""))).rejects.toThrow(
        /S3_BUCKET/,
      );
    });

    it("passes a custom endpoint with path-style addressing", async () => {
      process.env.S3_BUCKET = "b";
      process.env.S3_ENDPOINT = "https://minio.local";
      process.env.S3_REGION = "auto";
      await storagePut(1, "a.png", Buffer.from(""));
      // Success implies the endpoint branch constructed a client without error.
      expect(sendMock).toHaveBeenCalled();
    });
  });

  describe("storagePut — plan storage quota", () => {
    const GB = 1024 ** 3;

    beforeEach(() => {
      process.env.S3_BUCKET = "b";
    });

    it("writes when the upload fits inside the plan allowance", async () => {
      getTenantStorageBytesMock.mockResolvedValue(1 * GB); // 1 of 5 GB used
      await storagePut(1, "a.png", Buffer.alloc(1000));
      expect(sendMock).toHaveBeenCalledTimes(1);
      expect(recordStorageObjectMock).toHaveBeenCalledTimes(1);
    });

    it("refuses the upload that would cross the line, and does NOT touch S3", async () => {
      // The whole point: the object must never reach the bucket, or we pay for
      // storage the merchant's plan does not cover.
      getTenantStorageBytesMock.mockResolvedValue(5 * GB);
      await expect(
        storagePut(1, "a.png", Buffer.alloc(1000)),
      ).rejects.toBeInstanceOf(StorageQuotaError);
      expect(sendMock).not.toHaveBeenCalled();
      expect(recordStorageObjectMock).not.toHaveBeenCalled();
    });

    it("counts the incoming bytes, not just what is already stored", async () => {
      // Exactly at the limit with nothing to spare: a 1-byte upload must fail.
      // Checking `used > limit` instead of `used + incoming > limit` would let
      // an unbounded single upload through on a nearly-full account.
      getTenantStorageBytesMock.mockResolvedValue(5 * GB - 1);
      await expect(storagePut(1, "a.png", Buffer.alloc(2))).rejects.toBeInstanceOf(
        StorageQuotaError,
      );
      expect(sendMock).not.toHaveBeenCalled();
    });

    it("gives Pro its larger allowance from the same plan data", async () => {
      getTenantByIdMock.mockResolvedValue({ id: 1, plan: "pro" });
      // Well past Free's 5 GB, comfortably inside Pro's 50 GB.
      getTenantStorageBytesMock.mockResolvedValue(20 * GB);
      await storagePut(1, "a.png", Buffer.alloc(1000));
      expect(sendMock).toHaveBeenCalledTimes(1);
    });

    it("uses the limit the pricing page advertises", async () => {
      // Guards against the quota drifting from the number on the plan card.
      expect(storageBytesForPlan("free")).toBe(5 * GB);
      expect(storageBytesForPlan("pro")).toBe(50 * GB);
    });

    it("treats an unknown or missing tenant as Free, not unlimited", async () => {
      getTenantByIdMock.mockResolvedValue(undefined);
      getTenantStorageBytesMock.mockResolvedValue(5 * GB);
      await expect(
        storagePut(999, "a.png", Buffer.alloc(1)),
      ).rejects.toBeInstanceOf(StorageQuotaError);
    });

    it("does not consume allowance when the S3 write fails", async () => {
      // Recording before the upload would let repeated failures eat a
      // merchant's quota without storing anything.
      sendMock.mockRejectedValueOnce(new Error("network"));
      await expect(storagePut(1, "a.png", Buffer.alloc(10))).rejects.toThrow(
        /network/,
      );
      expect(recordStorageObjectMock).not.toHaveBeenCalled();
    });

    it("records the hashed key actually written, so a delete can free it", async () => {
      await storagePut(1, "photos/x.png", Buffer.alloc(42));
      const [tenantId, key, bytes] = recordStorageObjectMock.mock.calls[0];
      expect(tenantId).toBe(1);
      expect(bytes).toBe(42);
      // Must be the suffixed key from the PutObjectCommand, not the input path.
      const cmd = sendMock.mock.calls[0][0] as { input: Record<string, unknown> };
      expect(key).toBe(cmd.input.Key);
      expect(key).not.toBe("photos/x.png");
    });

    it("explains the limit in the error a merchant will see", async () => {
      getTenantStorageBytesMock.mockResolvedValue(5 * GB);
      const err = await storagePut(1, "a.png", Buffer.alloc(1)).catch((e) => e);
      expect(err).toBeInstanceOf(StorageQuotaError);
      expect(err.message).toMatch(/5\.0 GB/);
      expect(err.message).toMatch(/free plan/i);
      expect(err.message).toMatch(/delete some photos or upgrade/i);
      expect(err.plan).toBe("free");
      expect(err.limitBytes).toBe(5 * GB);
    });
  });

  describe("storageGet", () => {
    it("returns a normalized key and proxy URL", async () => {
      const result = await storageGet("/images/x.png");
      expect(result.key).toBe("images/x.png");
      expect(result.url).toBe("/uploads/images/x.png");
    });

    it("honours the public base URL", async () => {
      process.env.S3_PUBLIC_URL = "https://cdn.example.com";
      const result = await storageGet("images/x.png");
      expect(result.url).toBe("https://cdn.example.com/images/x.png");
    });
  });

  describe("storageGetSignedUrl", () => {
    it("delegates to the presigner with the default expiry", async () => {
      process.env.S3_BUCKET = "b";
      const url = await storageGetSignedUrl("/secret/doc.pdf");
      expect(url).toBe("https://signed.example/x");
      const [, cmd, opts] = getSignedUrlMock.mock.calls[0];
      expect((cmd as { input: Record<string, unknown> }).input.Key).toBe(
        "secret/doc.pdf",
      );
      expect(opts).toEqual({ expiresIn: 3600 });
    });

    it("forwards a custom expiry", async () => {
      process.env.S3_BUCKET = "b";
      await storageGetSignedUrl("doc.pdf", 60);
      const [, , opts] = getSignedUrlMock.mock.calls[0];
      expect(opts).toEqual({ expiresIn: 60 });
    });

    it("throws when the bucket is missing", async () => {
      await expect(storageGetSignedUrl("doc.pdf")).rejects.toThrow(/S3_BUCKET/);
    });
  });
});
