/**
 * QR rendering for the till.
 *
 * Done on the server rather than in the browser so the page needs no canvas
 * work and no QR library of its own: the till receives a finished image and
 * shows it. The thing being encoded is a Stripe Checkout URL, which is short
 * enough that error correction can be generous without the code getting dense.
 */

import QRCode from "qrcode";

/**
 * Error correction level M recovers ~15% of a damaged code. A phone screen
 * isn't damaged, but it is held at an angle, half-covered in fingerprints, and
 * read across a market stall in daylight — the same conditions, effectively.
 */
const ERROR_CORRECTION = "M" as const;

/** Rendered size in pixels. Large enough to stay sharp on a scaled-up display. */
const QR_WIDTH = 512;

/**
 * Encodes `text` as a PNG data URL.
 *
 * Throws when given an empty string: a QR of nothing scans as nothing, and a
 * blank square on the till reads to a cashier as "the code is loading" rather
 * than "this sale is broken".
 */
export async function renderQrDataUrl(text: string): Promise<string> {
  if (text.trim().length === 0) {
    throw new Error("Refusing to render a QR code for an empty string");
  }

  return QRCode.toDataURL(text, {
    errorCorrectionLevel: ERROR_CORRECTION,
    width: QR_WIDTH,
    margin: 2,
    color: { dark: "#000000ff", light: "#ffffffff" },
  });
}
