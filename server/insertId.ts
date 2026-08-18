/**
 * The auto-increment id of a row just inserted through drizzle's mysql2 driver.
 *
 * `await db.insert(t).values(v)` resolves to mysql2's RAW result — the
 * `[ResultSetHeader, FieldPacket[]]` tuple — not to the header itself. So
 * `result.insertId` reads a property off an Array and quietly yields
 * `undefined`, on a value whose type assertion claims it has one.
 *
 * That silence was expensive. `createPosOrder` fell back to `posOrderId = 0`,
 * which failed its own `if (posOrderId > 0)` guard, so every POS sale ever
 * recorded was written with NO line items and NO invoice number — the sales
 * history could not say what had been sold because nothing had been stored.
 * Bulk product creation hit the same `undefined` and threw on every item.
 *
 * It lives in its own module rather than in db.ts because it is pure: every
 * test that mocks `./db` wholesale would otherwise have to remember to stub a
 * function with no I/O in it, and forgetting is how this got missed once.
 *
 * Both shapes are accepted — the tuple the driver really returns, and a bare
 * header — so a caller that has already unwrapped one still works.
 */
export function insertedId(result: unknown): number {
  const header = Array.isArray(result) ? result[0] : result;
  const id = (header as { insertId?: unknown } | null | undefined)?.insertId;
  return typeof id === "number" && Number.isFinite(id) && id > 0 ? id : 0;
}
