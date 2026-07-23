import { describe, expect, it, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const { storageGetSignedUrl } = vi.hoisted(() => ({
  storageGetSignedUrl: vi.fn(),
}));

vi.mock("../storage", () => ({ storageGetSignedUrl }));

import { registerUploadsProxy } from "./uploadsProxy";

function makeApp() {
  const app = express();
  registerUploadsProxy(app);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("registerUploadsProxy", () => {
  it("redirects to a presigned URL for the requested key", async () => {
    storageGetSignedUrl.mockResolvedValue("https://s3.example/signed");
    const res = await request(makeApp()).get("/uploads/products/a.jpg");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("https://s3.example/signed");
    expect(storageGetSignedUrl).toHaveBeenCalledWith("products/a.jpg", 3600);
  });

  it("returns 500 when signing fails", async () => {
    storageGetSignedUrl.mockRejectedValue(new Error("s3 down"));
    const res = await request(makeApp()).get("/uploads/products/a.jpg");
    expect(res.status).toBe(500);
    expect(res.text).toContain("Failed to serve file");
  });
});
