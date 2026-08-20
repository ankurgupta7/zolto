/**
 * The rename harness.
 *
 * shared/brand.ts covers every surface that can import TypeScript. This file
 * covers the two that cannot:
 *
 *   1. **Foreign build systems.** Gradle, xcodegen's `project.yml`, Android XML,
 *      the Caddyfile, compose, the Dockerfile, `.env.example`, `package.json`,
 *      `client/index.html`. These spell the brand literally because nothing can
 *      inject a value into them at the point they are read. Each literal is
 *      asserted against `BRAND` here, so a rename does not have to *find* them —
 *      the failing assertions name the file and the expected string.
 *
 *   2. **Residue.** A repo-wide sweep for the retired names. This is the check
 *      that would have caught `KalakoshApplication.kt` declaring
 *      `class ZoltoApplication`, and the `kalakosh_lang` localStorage key that
 *      the i18n bootstrap was still reading two brands later.
 *
 * Adding a name to {@link RETIRED} after the next rename is the whole
 * maintenance burden.
 */

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { BRAND, BRAND_GENERATOR, pairingLink, storefrontHost } from "./brand";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(relPath: string): string {
  return readFileSync(resolve(REPO, relPath), "utf8");
}

describe("BRAND derivations", () => {
  it("derives every machine form from the one display name", () => {
    expect(BRAND.slug).toBe(BRAND.name.toLowerCase());
    expect(BRAND.domain.startsWith(`${BRAND.slug}.`)).toBe(true);
    expect(BRAND.url).toBe(`https://${BRAND.domain}`);
    expect(BRAND.reverseDns.endsWith(`.${BRAND.slug}`)).toBe(true);
    expect(BRAND.androidApplicationId).toBe(`${BRAND.reverseDns}.pos`);
    expect(BRAND.iosBundleId).toBe(BRAND.androidApplicationId);
  });

  it("keeps the marketing hosts to the apex and www, and nothing else", () => {
    expect([...BRAND.marketingHosts].sort()).toEqual(
      [BRAND.domain, BRAND.wwwHost].sort(),
    );
  });

  it("builds storefront hosts and pairing links off the same brand", () => {
    expect(storefrontHost("bergblume")).toBe(`bergblume.${BRAND.domain}`);
    expect(pairingLink("tok123")).toBe(`${BRAND.urlScheme}://pair?t=tok123`);
    expect(pairingLink("tok", "https://bergblume.example")).toContain(
      `${BRAND.urlScheme}://pair?t=tok&url=`,
    );
  });

  it("produces a Stripe statement descriptor Stripe will accept", () => {
    // Stripe caps statement_descriptor at 22 characters and rejects <>"'.
    expect(BRAND.stripeStatementFallback.length).toBeLessThanOrEqual(22);
    expect(BRAND.stripeStatementFallback).not.toMatch(/[<>"']/);
  });

  it("names the generator the way every site builder does", () => {
    expect(BRAND_GENERATOR).toBe(`${BRAND.name} (${BRAND.url})`);
  });
});

/**
 * Every literal spelling of the brand outside TypeScript. `expected` is derived
 * from BRAND, so this table describes *where* the name is duplicated, never
 * *what* it is.
 */
const FOREIGN_SURFACES: ReadonlyArray<{
  file: string;
  what: string;
  expected: () => string;
}> = [
  {
    file: "package.json",
    what: "npm package name",
    expected: () => `"name": "${BRAND.slug}"`,
  },
  {
    file: "client/index.html",
    what: "document title",
    expected: () => `<title>${BRAND.name}</title>`,
  },
  {
    file: "android/app/build.gradle.kts",
    what: "Gradle namespace",
    expected: () => `namespace = "${BRAND.androidApplicationId}"`,
  },
  {
    file: "android/app/build.gradle.kts",
    what: "Gradle applicationId",
    expected: () => `applicationId = "${BRAND.androidApplicationId}"`,
  },
  {
    file: "android/settings.gradle.kts",
    what: "Gradle root project name",
    expected: () => `rootProject.name = "${BRAND.posProduct}"`,
  },
  {
    file: "android/app/src/main/AndroidManifest.xml",
    what: "pairing deep-link scheme",
    expected: () => `android:scheme="${BRAND.urlScheme}"`,
  },
  {
    file: "android/app/src/main/res/values/strings.xml",
    what: "Android app label",
    expected: () => `<string name="app_name">${BRAND.posDisplayName}</string>`,
  },
  {
    file: `ios/${BRAND.posProduct}/project.yml`,
    what: "iOS bundle identifier",
    expected: () => `PRODUCT_BUNDLE_IDENTIFIER: ${BRAND.iosBundleId}`,
  },
  {
    file: `ios/${BRAND.posProduct}/project.yml`,
    what: "iOS display name",
    expected: () => `CFBundleDisplayName: ${BRAND.posDisplayName}`,
  },
  {
    file: `ios/${BRAND.posProduct}/project.yml`,
    what: "iOS pairing URL scheme",
    expected: () => `- ${BRAND.urlScheme}`,
  },
  {
    file: "Dockerfile",
    what: "source-fingerprint image label",
    expected: () => BRAND.dockerFingerprintLabel,
  },
  {
    file: "deploy/lib/build.sh",
    what: "the label deploy reads back",
    expected: () => BRAND.dockerFingerprintLabel,
  },
  {
    file: "docker-compose.yml",
    what: "app alias on the shared network",
    expected: () => BRAND.dockerAppAlias,
  },
  {
    file: ".env.example",
    what: "default database name",
    expected: () => `MYSQL_DATABASE=${BRAND.dbName}`,
  },
  {
    file: ".env.example",
    what: "default database user",
    expected: () => `MYSQL_USER=${BRAND.dbUser}`,
  },
  {
    file: ".env.example",
    what: "Apple Services ID",
    expected: () => `APPLE_CLIENT_ID=${BRAND.appleServicesId}`,
  },
  {
    file: ".env.example",
    what: "the site domain Caddy provisions HTTPS for",
    expected: () => `SITE_DOMAIN=${BRAND.domain}`,
  },
  {
    file: ".github/workflows/android-build.yml",
    what: "released APK filename",
    expected: () => BRAND.androidApkAsset,
  },
  // The two register apps parse pairing links themselves, so the scheme and the
  // fallback origin are literals in Kotlin and Swift. If either drifts from
  // server/posPairing.ts the deep link silently stops opening the app.
  {
    file: "android/logic/src/main/kotlin/ch/gwinn/pos/logic/PairingLink.kt",
    what: "pairing scheme",
    expected: () => `const val SCHEME = "${BRAND.urlScheme}"`,
  },
  {
    file: "android/logic/src/main/kotlin/ch/gwinn/pos/logic/PairingLink.kt",
    what: "fallback server origin",
    expected: () => `const val DEFAULT_BASE_URL = "${BRAND.url}"`,
  },
  {
    file: `ios/${BRAND.posProduct}/${BRAND.posProduct}/Logic/Pairing.swift`,
    what: "fallback server origin",
    expected: () => `static let defaultBaseURL = "${BRAND.url}"`,
  },
  {
    file: `ios/${BRAND.posProduct}/${BRAND.posProduct}/Logic/Pairing.swift`,
    what: "pairing scheme",
    expected: () => `== "${BRAND.urlScheme}"`,
  },
  {
    file: `ios/${BRAND.posProduct}/${BRAND.posProduct}/Services/SecureStore.swift`,
    what: "Keychain service holding the paired POS key",
    expected: () => `"${BRAND.iosKeychainService}"`,
  },
];

describe("surfaces that cannot import shared/brand.ts", () => {
  for (const { file, what, expected } of FOREIGN_SURFACES) {
    it(`${file} — ${what}`, () => {
      expect(read(file)).toContain(expected());
    });
  }
});

/**
 * Names this codebase has shipped under and must no longer contain anywhere.
 * Append to this list on the next rename; do not remove entries.
 *
 * `kalakosh` is deliberately absent: it is a real, separate business the
 * platform imports from and compares against (server/importKalakosh.ts,
 * ios/Kalakosh/), not a retired name of this one.
 */
const RETIRED = ["zolto"];

/**
 * Files allowed to name a retired brand, because naming it is the point:
 * the rename plan, the historical note in shared/brand.ts, and this file.
 */
const RESIDUE_ALLOWLIST = [
  "docs/planning/rebrand-gwinn.md",
  "shared/brand.ts",
  "shared/brand.check.test.ts",
];

describe("no residue from a retired brand", () => {
  for (const retired of RETIRED) {
    it(`"${retired}" appears nowhere in the tree`, () => {
      // Ask git rather than walking the filesystem: it already knows what is
      // tracked, so node_modules, dist/ and untracked scratch files cost
      // nothing to skip and a newly added file is never missed.
      let hits: string[] = [];
      try {
        hits = execFileSync(
          "git",
          ["grep", "-I", "-i", "-l", retired, "--", "."],
          { cwd: REPO, encoding: "utf8" },
        )
          .split("\n")
          .filter(Boolean);
      } catch (err) {
        // git grep exits 1 with no output when nothing matches, which is the
        // outcome this test wants. Any other failure is a real error.
        const status = (err as { status?: number }).status;
        if (status !== 1) throw err;
      }

      const unexpected = hits.filter((f) => !RESIDUE_ALLOWLIST.includes(f));
      expect(unexpected).toEqual([]);
    });
  }
});
