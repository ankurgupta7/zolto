import { describe, expect, it } from "vitest";
import {
  AUTHOR_IDENTITY_RELEASED,
  NAMED_AUTHOR,
  EDITORIAL_AUTHOR,
  author,
  hasNamedAuthor,
  authorJsonLd,
} from "./authors";

const BASE = "https://zolto.com";

describe("author attribution gate", () => {
  it("attributes to the organization while no author is named", () => {
    // Guards the gate itself: naming a real person in marketing needs their
    // sign-off, so this must not drift open by accident.
    expect(hasNamedAuthor()).toBe(AUTHOR_IDENTITY_RELEASED && !!NAMED_AUTHOR);
    if (!hasNamedAuthor()) {
      expect(author).toBe(EDITORIAL_AUTHOR);
    }
  });

  it("never emits a Person with no credentials", () => {
    // A Person node with an empty credential list looks like a trust signal
    // while carrying no information — worse than honest org attribution.
    const node = authorJsonLd(BASE) as Record<string, any>;
    if (node["@type"] === "Person") {
      expect(node.name).toBeTruthy();
      expect(node.jobTitle).toBeTruthy();
    } else {
      expect(node["@type"]).toBe("Organization");
      expect(node.name).toBe(EDITORIAL_AUTHOR.name);
    }
  });

  it("produces a schema node with a type in every configuration", () => {
    const node = authorJsonLd(BASE) as Record<string, any>;
    expect(["Person", "Organization"]).toContain(node["@type"]);
  });

  it("claims no credentials it cannot back up", () => {
    expect(EDITORIAL_AUTHOR.credentials).toEqual([]);
  });
});
