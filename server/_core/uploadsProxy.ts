/**
 * Uploads proxy — serves S3 files via signed URLs at /uploads/:key
 *
 * When S3_PUBLIC_URL is set, images are served directly from that CDN URL
 * and this proxy is not needed. When it is not set, this route generates a
 * presigned GET URL and redirects the browser to it.
 */

import type { Express } from "express";
import { storageGetSignedUrl } from "../storage";

export function registerUploadsProxy(app: Express): void {
  app.get("/uploads/*", async (req, res) => {
    try {
      // Strip the leading /uploads/ prefix to get the S3 key
      const key = req.path.replace(/^\/uploads\//, "");
      if (!key) {
        res.status(400).send("Missing file key");
        return;
      }

      const signedUrl = await storageGetSignedUrl(key, 3600);
      res.redirect(302, signedUrl);
    } catch (err) {
      console.error("[UploadsProxy] Error generating signed URL:", err);
      res.status(500).send("Failed to serve file");
    }
  });
}
