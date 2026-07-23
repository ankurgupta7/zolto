import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock DNS resolution so hostname tests don't hit the network.
const { lookupMock } = vi.hoisted(() => ({ lookupMock: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: lookupMock }));

import { isPrivateOrReservedIp, assertPublicHostname } from "./ssrf";

describe("isPrivateOrReservedIp", () => {
  it("flags IPv4 loopback / private / link-local / CGNAT / reserved ranges", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.0.1",
      "169.254.169.254", // cloud metadata endpoint
      "100.64.0.1", // CGNAT
      "0.0.0.0",
      "224.0.0.1", // multicast
    ]) {
      expect(isPrivateOrReservedIp(ip)).toBe(true);
    }
  });

  it("allows public IPv4 addresses", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "172.15.0.1", "172.32.0.1"]) {
      expect(isPrivateOrReservedIp(ip)).toBe(false);
    }
  });

  it("flags IPv6 loopback / unspecified / link-local / unique-local", () => {
    for (const ip of ["::1", "::", "fe80::1", "fc00::1", "fd12::34"]) {
      expect(isPrivateOrReservedIp(ip)).toBe(true);
    }
  });

  it("allows public IPv6 addresses", () => {
    expect(isPrivateOrReservedIp("2606:4700:4700::1111")).toBe(false);
  });

  it("re-checks the embedded address of IPv4-mapped IPv6", () => {
    expect(isPrivateOrReservedIp("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateOrReservedIp("::ffff:8.8.8.8")).toBe(false);
  });

  it("treats unrecognised literals as unsafe", () => {
    expect(isPrivateOrReservedIp("not-an-ip")).toBe(true);
  });
});

describe("assertPublicHostname", () => {
  beforeEach(() => lookupMock.mockReset());

  it("rejects localhost without a DNS lookup", async () => {
    await expect(assertPublicHostname("localhost")).rejects.toThrow(
      /Internal URLs not allowed/,
    );
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it("rejects a literal private IP without a DNS lookup", async () => {
    await expect(assertPublicHostname("169.254.169.254")).rejects.toThrow(
      /Internal URLs not allowed/,
    );
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it("allows a literal public IP without a DNS lookup", async () => {
    await expect(assertPublicHostname("8.8.8.8")).resolves.toBeUndefined();
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it("rejects a hostname that resolves to a private address", async () => {
    lookupMock.mockImplementation(async () => [
      { address: "10.0.0.5", family: 4 },
    ]);
    await expect(assertPublicHostname("evil.example.com")).rejects.toThrow(
      /Internal URLs not allowed/,
    );
  });

  it("allows a hostname that resolves only to public addresses", async () => {
    lookupMock.mockImplementation(async () => [
      { address: "93.184.216.34", family: 4 },
    ]);
    await expect(assertPublicHostname("example.com")).resolves.toBeUndefined();
  });

  it("rejects when DNS resolution fails", async () => {
    // Simulate a resolution failure. We return a non-array (rather than a
    // rejected promise) so the failure surfaces synchronously inside the same
    // try/catch that wraps the real dnsLookup call — this exercises the exact
    // "Could not resolve host" branch without leaving a floating rejected
    // promise for Vitest's unhandled-rejection detector to trip over.
    lookupMock.mockImplementation(async () => undefined);
    let message = "did not throw";
    try {
      await assertPublicHostname("nope.invalid");
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).toMatch(/Could not resolve host/);
  });

  it("rejects a hostname that resolves to no addresses", async () => {
    lookupMock.mockImplementation(async () => []);
    await expect(assertPublicHostname("empty.example.com")).rejects.toThrow(
      /Internal URLs not allowed/,
    );
  });
});
