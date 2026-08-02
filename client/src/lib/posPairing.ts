/**
 * POS pairing payload — what the "scan to pair" QR on Keys & access encodes.
 *
 * The POS apps (Android, and the Zolto POS iOS app) scan this instead of the
 * merchant typing a 64-char key on a phone keyboard. Versioned JSON rather
 * than a URL: a URL invites the OS to open a browser on scan, while the POS
 * app's own scanner just wants structured data.
 *
 * The payload contains the key PLAINTEXT, which only exists client-side for
 * the moment after generation/rotation — so the QR can only be rendered in
 * that same moment, and goes away with it. Nothing here is persisted.
 */

export interface PosPairingPayload {
  /** Format discriminator + version for the scanning apps. */
  zoltoPos: 1;
  /** API origin the POS should talk to, e.g. https://zolto.ch */
  baseUrl: string;
  /** The tenant's POS API key, plaintext (bearer credential). */
  key: string;
}

/** Serialize the payload for QR encoding. Throws on a blank key or origin. */
export function buildPosPairingPayload(baseUrl: string, key: string): string {
  const origin = baseUrl.trim().replace(/\/+$/, "");
  if (!/^https?:\/\/[^\s/]+$/.test(origin)) {
    throw new Error(`Not an origin: ${JSON.stringify(baseUrl)}`);
  }
  if (!key.trim()) {
    throw new Error("Refusing to encode an empty POS key");
  }
  const payload: PosPairingPayload = { zoltoPos: 1, baseUrl: origin, key };
  return JSON.stringify(payload);
}

/**
 * Parse a scanned payload (the counterpart the apps implement natively —
 * exported here so tests pin the round-trip and the format can't drift).
 */
export function parsePosPairingPayload(text: string): PosPairingPayload | null {
  try {
    const parsed = JSON.parse(text) as Partial<PosPairingPayload>;
    if (
      parsed.zoltoPos === 1 &&
      typeof parsed.baseUrl === "string" &&
      typeof parsed.key === "string" &&
      parsed.baseUrl.length > 0 &&
      parsed.key.length > 0
    ) {
      return parsed as PosPairingPayload;
    }
    return null;
  } catch {
    return null;
  }
}
