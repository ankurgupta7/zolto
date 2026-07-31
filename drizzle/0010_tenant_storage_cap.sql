-- Storage caps: PLANS[].storageGb was declared and displayed but never
-- enforced. Mirrors the maxProducts pattern (server/db.ts createProduct) —
-- one counter, incremented atomically at the single upload choke point
-- (storagePut, server/storage.ts) so every intake channel obeys the same cap.
ALTER TABLE `tenants` ADD COLUMN `storage_bytes_used` bigint NOT NULL DEFAULT 0;
