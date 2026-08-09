import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { AI_NATIVE_PITCH } from "@shared/platform";
import {
  DiscoveryShiftChart,
  AiNativeBand,
  AgentChatMock,
  AgentProofBand,
  HowAnAiBuys,
} from "./AgentPitch";

afterEach(cleanup);

describe("AiNativeBand", () => {
  it("states the thesis with its chart, as a section rather than the page title", () => {
    render(<AiNativeBand />);
    // The copy is the copy that used to be the hero — unchanged. What moved is
    // the heading level: this argues for choosing Zolto, it doesn't name it.
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading.textContent).toContain(AI_NATIVE_PITCH.headline);
    expect(heading.textContent).toContain(AI_NATIVE_PITCH.headlineEmphasis);
    expect(screen.getByText(AI_NATIVE_PITCH.eyebrow)).toBeTruthy();
    expect(screen.getByText(AI_NATIVE_PITCH.body)).toBeTruthy();
    // The chart came down the page with it rather than being dropped.
    expect(screen.getByText(AI_NATIVE_PITCH.chart.caption)).toBeTruthy();
  });
});

describe("DiscoveryShiftChart", () => {
  it("labels both curves and states the caption", () => {
    render(<DiscoveryShiftChart />);
    expect(screen.getByText(AI_NATIVE_PITCH.chart.decliningLabel)).toBeTruthy();
    expect(screen.getByText(AI_NATIVE_PITCH.chart.risingLabel)).toBeTruthy();
    expect(screen.getByText(AI_NATIVE_PITCH.chart.caption)).toBeTruthy();
    // Accessible as an image, not a decorative blob.
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain(
      AI_NATIVE_PITCH.chart.risingLabel,
    );
  });
});

describe("AgentChatMock", () => {
  it("walks ask → recommend → confirm → order placed", () => {
    render(<AgentChatMock />);
    expect(screen.getByText(/handmade ceramic mug/i)).toBeTruthy();
    expect(screen.getByText(/Order placed/i)).toBeTruthy();
    // The mechanism is named — this is an MCP purchase, not vague magic.
    expect(screen.getByText(/bergblume\.zolto\.ch\/mcp/i)).toBeTruthy();
  });

  it("renders the price with lining figures so CHF 38 can't read as CHF 3o", () => {
    render(<AgentChatMock />);
    const price = screen.getByText(/CHF 38 · 3 in stock/);
    expect(price.className).toContain("lining-nums");
  });
});

describe("AgentProofBand", () => {
  it("frames the demo as live and links the real llms.txt", () => {
    render(<AgentProofBand />);
    expect(
      screen.getByRole("heading", { name: AI_NATIVE_PITCH.proof.headline }),
    ).toBeTruthy();
    expect(screen.getByText(AI_NATIVE_PITCH.proof.eyebrow)).toBeTruthy();
    // The proof invites verification: the link points at the page the
    // platform actually serves (server/llms.ts), not a marketing anchor.
    expect(
      screen.getByRole("link", { name: /llms\.txt/i }).getAttribute("href"),
    ).toBe("/llms.txt");
  });
});

describe("HowAnAiBuys", () => {
  it("renders the three steps in found → asked → bought order", () => {
    render(<HowAnAiBuys />);
    const headings = screen
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent);
    expect(headings).toEqual(AI_NATIVE_PITCH.steps.map((s) => s.title));
    expect(screen.getByText("1. Found")).toBeTruthy();
    expect(screen.getByText("3. Bought")).toBeTruthy();
  });

  it("closes on the free-plan footnote", () => {
    render(<HowAnAiBuys />);
    expect(screen.getByText(AI_NATIVE_PITCH.footnote)).toBeTruthy();
  });
});
