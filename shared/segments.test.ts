import { describe, expect, it } from "vitest";
import {
  SEGMENTS,
  findSegment,
  segmentFeatures,
  renderSegmentText,
} from "./segments";
import { FEATURES } from "./platform";

describe("segments", () => {
  it("only references features Zolto actually ships", () => {
    // The grounding rule: a segment page must not be able to promise a
    // capability that doesn't exist.
    const known = new Set(FEATURES.map((f) => f.id));
    for (const s of SEGMENTS) {
      for (const id of s.featureIds) {
        expect(known, `segment "${s.id}" → feature "${id}"`).toContain(id);
      }
    }
  });

  it("throws loudly on an unknown feature id rather than dropping it", () => {
    expect(() =>
      segmentFeatures({
        ...SEGMENTS[0],
        featureIds: ["not-a-real-feature"],
      }),
    ).toThrow(/unknown feature id/);
  });

  it("resolves features in the declared order", () => {
    const s = SEGMENTS[0];
    expect(segmentFeatures(s).map((f) => f.id)).toEqual(s.featureIds);
  });

  it("gives every segment unique, URL-safe ids", () => {
    const ids = SEGMENTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("gives every segment substantive content", () => {
    for (const s of SEGMENTS) {
      expect(s.painPoints.length, s.id).toBeGreaterThanOrEqual(2);
      expect(s.featureIds.length, s.id).toBeGreaterThanOrEqual(2);
      expect(s.scenario.length, s.id).toBeGreaterThan(40);
    }
  });

  it("looks segments up by id and returns undefined otherwise", () => {
    expect(findSegment("jewelry-makers")?.name).toBe("Jewelry makers");
    expect(findSegment("nonesuch")).toBeUndefined();
  });

  it("renders crawler text carrying the problems and the real features", () => {
    for (const s of SEGMENTS) {
      const text = renderSegmentText(s);
      expect(text).toContain(s.headline);
      expect(text).toContain(s.painPoints[0]);
      expect(text).toContain(segmentFeatures(s)[0].name);
      expect(text).toContain(s.scenario);
    }
  });
});
