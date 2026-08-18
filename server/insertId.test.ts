import { describe, expect, it } from "vitest";
import { insertedId } from "./insertId";

/**
 * These cases are the bug, written down.
 *
 * Every call site read `(result as { insertId?: number }).insertId` off a
 * value that is really `[ResultSetHeader, FieldPacket[]]`, got `undefined`,
 * and fell back to 0 — which is why no POS sale was ever given line items or
 * an invoice number.
 */
describe("insertedId", () => {
  // The shape the mysql2 driver actually resolves an insert to.
  it("reads the id out of the driver's [header, fields] tuple", () => {
    expect(insertedId([{ insertId: 42, affectedRows: 1 }, []])).toBe(42);
  });

  it("also accepts a bare result header", () => {
    expect(insertedId({ insertId: 42, affectedRows: 1 })).toBe(42);
  });

  // A caller cannot distinguish "no id" from "id 0"; both are unusable as a
  // foreign key, so both are 0 and callers are expected to treat that as an
  // error rather than writing rows against it.
  it("returns 0 rather than a bogus id when there is nothing to read", () => {
    expect(insertedId(undefined)).toBe(0);
    expect(insertedId(null)).toBe(0);
    expect(insertedId([])).toBe(0);
    expect(insertedId({})).toBe(0);
    expect(insertedId([{ affectedRows: 0 }, []])).toBe(0);
    expect(insertedId({ insertId: 0 })).toBe(0);
    expect(insertedId({ insertId: "42" })).toBe(0);
    expect(insertedId({ insertId: Number.NaN })).toBe(0);
  });
});
