import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MAKER_PITCH } from "@shared/platform";
import { HeroTill } from "./HeroTill";

afterEach(cleanup);

describe("HeroTill", () => {
  it("shows the till with its wares and the payment methods", () => {
    render(<HeroTill />);
    expect(screen.getByText(MAKER_PITCH.register.methods)).toBeTruthy();
    expect(screen.getByText(MAKER_PITCH.register.caption)).toBeTruthy();
  });

  it("draws the phone as an accessible image carrying the argument", () => {
    render(<HeroTill />);
    // SqueezePlayTill is role="img" with a real title — the hero's picture is
    // the product, so a screen reader has to get it too.
    const img = screen.getByRole("img");
    expect(img.querySelector("title")?.textContent).toBe(
      MAKER_PITCH.register.title,
    );
  });

  it("renders the grid variant, not the keypad one", () => {
    // The whole point of the hero visual is a catalogue of actual objects. The
    // keypad variant (`has` without "grid") would draw a payment app instead —
    // a different product, and the one the squeeze play argues against.
    const { container } = render(<HeroTill />);
    // Six ware tiles (two columns by three rows) on top of the handset, QR and
    // banknote — a count the keypad variant, which draws one amount field and
    // nine key circles, can't reach.
    expect(container.querySelectorAll("rect").length).toBeGreaterThanOrEqual(
      12,
    );
    expect(container.querySelectorAll("circle").length).toBeLessThan(9);
  });
});
