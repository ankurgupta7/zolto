import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import PosAppCard from "./PosAppCard";

vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

afterEach(() => cleanup());

// The app is built in CI (android/ — ch.zolto.pos) but is not published to
// either store, so there is no listing URL to hard-code. The card must not
// render a dead button: a merchant who taps a broken store link concludes the
// POS does not exist.
describe("PosAppCard — before the app is published", () => {
  it("says the app is not published instead of linking nowhere", () => {
    render(<PosAppCard serverUrl="https://bergblume.zolto.ch" />);
    expect(screen.getByText(/Android — not published yet/)).toBeTruthy();
    expect(screen.getByText(/iPhone — not published yet/)).toBeTruthy();
    expect(screen.queryByText(/Get it for/)).toBeNull();
  });

  it("tells the merchant the rest of the page still works", () => {
    render(<PosAppCard serverUrl="https://bergblume.zolto.ch" />);
    expect(screen.getByText(/still in testing/i)).toBeTruthy();
  });
});

describe("PosAppCard — pairing", () => {
  it("shows the server address the app asks for on first launch", () => {
    render(<PosAppCard serverUrl="https://bergblume.zolto.ch" />);
    expect(screen.getByText("https://bergblume.zolto.ch")).toBeTruthy();
    expect(screen.getByLabelText("Copy server address")).toBeTruthy();
  });

  it("sends the merchant to Keys & access for the credential, not this page", () => {
    // The POS API key is a bearer credential; it belongs on the keys page,
    // which is where rotation and one-time reveal already live.
    render(<PosAppCard serverUrl="https://bergblume.zolto.ch" />);
    const link = screen.getByText(/Keys & access/).closest("a");
    expect(link?.getAttribute("href")).toBe("/admin/account/keys");
  });

  it("never renders the key itself", () => {
    render(<PosAppCard serverUrl="https://bergblume.zolto.ch" />);
    expect(document.body.textContent).not.toMatch(/pos_[A-Za-z0-9]/);
  });
});
