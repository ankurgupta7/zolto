import { TRPCError } from "@trpc/server";
import { isIPv4, isIPv6 } from "node:net";
import { lookup as dnsLookup } from "node:dns/promises";

// Blocks loopback, private, link-local (incl. the 169.254.169.254 cloud
// metadata endpoint) and other non-publicly-routable IPv4/IPv6 ranges.
export function isPrivateOrReservedIp(ip: string): boolean {
  if (isIPv4(ip)) {
    const octets = ip.split(".").map(Number);
    const [a, b] = octets;
    if (a === 127) return true; // loopback
    if (a === 10) return true; // private
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 169 && b === 254) return true; // link-local incl. cloud metadata
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 0) return true; // "this" network
    if (a >= 224) return true; // multicast / reserved
    return false;
  }
  if (isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true; // loopback / unspecified
    if (
      lower.startsWith("fe80:") ||
      lower.startsWith("fe8") ||
      lower.startsWith("fe9") ||
      lower.startsWith("fea") ||
      lower.startsWith("feb")
    )
      return true; // link-local
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local
    // IPv4-mapped (::ffff:a.b.c.d) — re-check the embedded IPv4 address
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateOrReservedIp(mapped[1]);
    return false;
  }
  return true; // not a recognised literal IP — treat conservatively as unsafe
}

export async function assertPublicHostname(hostname: string): Promise<void> {
  if (hostname === "localhost") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Internal URLs not allowed",
    });
  }
  // If the hostname is already a literal IP, validate it directly.
  if (isIPv4(hostname) || isIPv6(hostname)) {
    if (isPrivateOrReservedIp(hostname)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Internal URLs not allowed",
      });
    }
    return;
  }
  // Otherwise resolve the hostname so attackers can't bypass the blocklist
  // with a domain that simply points at an internal/metadata address.
  let addresses: string[];
  try {
    addresses = (await dnsLookup(hostname, { all: true })).map(
      (a) => a.address,
    );
  } catch {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Could not resolve host",
    });
  }
  if (addresses.length === 0 || addresses.some(isPrivateOrReservedIp)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Internal URLs not allowed",
    });
  }
}
