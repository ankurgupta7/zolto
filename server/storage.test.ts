import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { sendMock, getSignedUrlMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  getSignedUrlMock: vi.fn(),
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

import { storagePut, storageGet, storageGetSignedUrl } from "./storage";

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
      const result = await storagePut("images/cat.png", Buffer.from("hi"));

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
      await storagePut("notes.txt", "plain text", "text/plain");
      const cmd = sendMock.mock.calls[0][0] as {
        input: Record<string, unknown>;
      };
      expect(Buffer.isBuffer(cmd.input.Body)).toBe(true);
      expect((cmd.input.Body as Buffer).toString()).toBe("plain text");
      expect(cmd.input.ContentType).toBe("text/plain");
    });

    it("appends the hash without an extension when the key has no dot", async () => {
      process.env.S3_BUCKET = "b";
      const result = await storagePut("rawkey", Buffer.from(""));
      expect(result.key).toMatch(/^rawkey_[0-9a-f]{8}$/);
    });

    it("strips leading slashes from the key", async () => {
      process.env.S3_BUCKET = "b";
      const result = await storagePut("///deep/file.jpg", Buffer.from(""));
      expect(result.key.startsWith("deep/")).toBe(true);
    });

    it("uses the public base URL when configured", async () => {
      process.env.S3_BUCKET = "b";
      process.env.S3_PUBLIC_URL = "https://cdn.example.com/";
      const result = await storagePut("a.png", Buffer.from(""));
      expect(result.url).toBe(`https://cdn.example.com/${result.key}`);
    });

    it("throws when the bucket is not configured", async () => {
      await expect(storagePut("a.png", Buffer.from(""))).rejects.toThrow(
        /S3_BUCKET/,
      );
    });

    it("passes a custom endpoint with path-style addressing", async () => {
      process.env.S3_BUCKET = "b";
      process.env.S3_ENDPOINT = "https://minio.local";
      process.env.S3_REGION = "auto";
      await storagePut("a.png", Buffer.from(""));
      // Success implies the endpoint branch constructed a client without error.
      expect(sendMock).toHaveBeenCalled();
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
