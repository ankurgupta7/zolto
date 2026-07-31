/**
 * Self-hosted S3 storage helper
 *
 * Works with any S3-compatible provider:
 *   - AWS S3          → S3_ENDPOINT not needed (uses default AWS endpoint)
 *   - Cloudflare R2   → S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com
 *   - Backblaze B2    → S3_ENDPOINT=https://s3.<region>.backblazeb2.com
 *   - MinIO (local)   → S3_ENDPOINT=http://localhost:9000
 *
 * Required env vars:
 *   S3_BUCKET            — bucket name
 *   S3_REGION            — region (e.g. "us-east-1", "auto" for R2)
 *   S3_ACCESS_KEY_ID     — access key
 *   S3_SECRET_ACCESS_KEY — secret key
 *   S3_ENDPOINT          — (optional) custom endpoint for non-AWS providers
 *   S3_PUBLIC_URL        — (optional) public base URL for serving files
 *                          e.g. https://pub-xxx.r2.dev  or  https://cdn.yourdomain.com
 *                          If not set, files are served via the /uploads proxy route.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "node:crypto";
import { PLANS } from "@shared/platform";
import { getTenantById, incrementTenantStorageUsage } from "./db";

function getS3Client(): S3Client {
  const region = process.env.S3_REGION ?? "us-east-1";
  const endpoint = process.env.S3_ENDPOINT;

  return new S3Client({
    region,
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
    },
  });
}

function getBucket(): string {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error("S3_BUCKET env var is not set");
  return bucket;
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function buildPublicUrl(key: string): string {
  const publicBase = process.env.S3_PUBLIC_URL;
  if (publicBase) {
    return `${publicBase.replace(/\/+$/, "")}/${key}`;
  }
  // Fall back to serving via the local /uploads proxy route
  return `/uploads/${key}`;
}

const BYTES_PER_GB = 1024 ** 3;

// Scale metering (two-tier pricing): plans cap photo storage
// (shared/platform.ts PLANS[].storageGb), never AI usage. Enforced here, the
// single choke point every intake channel — admin UI, bulk upload, AI photo
// styling, Discord/WhatsApp/Slack — shares, so no caller can bypass it. Fails
// open when the tenant row can't be loaded so a broken lookup never blocks
// writes, matching createProduct's maxProducts enforcement in server/db.ts.
async function assertStorageCapNotExceeded(
  tenantId: number,
  incomingBytes: number,
): Promise<void> {
  const tenant = await getTenantById(tenantId);
  if (!tenant) return;
  const capGb = PLANS.find((p) => p.id === tenant.plan)?.storageGb;
  if (capGb === undefined) return;
  const capBytes = capGb * BYTES_PER_GB;
  const used = Number(tenant.storageBytesUsed ?? 0);
  if (used + incomingBytes > capBytes) {
    throw new Error(
      `Your photo storage is at its ${capGb} GB limit on the ${tenant.plan} plan — upgrade for more room.`,
    );
  }
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
  tenantId?: number,
): Promise<{ key: string; url: string }> {
  const body = typeof data === "string" ? Buffer.from(data) : data;

  if (tenantId !== undefined) {
    await assertStorageCapNotExceeded(tenantId, body.byteLength);
  }

  const client = getS3Client();
  const bucket = getBucket();
  const key = appendHashSuffix(normalizeKey(relKey));

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );

  if (tenantId !== undefined) {
    incrementTenantStorageUsage(tenantId, body.byteLength).catch((err) =>
      console.error("[Storage] Failed to record storage usage:", err),
    );
  }

  return { key, url: buildPublicUrl(key) };
}

export async function storageGet(
  relKey: string,
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: buildPublicUrl(key) };
}

export async function storageGetSignedUrl(
  relKey: string,
  expiresIn = 3600,
): Promise<string> {
  const client = getS3Client();
  const bucket = getBucket();
  const key = normalizeKey(relKey);

  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn },
  );
}
