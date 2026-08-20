import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { AI_NATIVE_PITCH } from "@shared/platform";
import {
  DiscoveryShiftChart,
  AiNativeThesis,
  AgentChatMock,
  AgentProofBand,
  HowAnAiBuys,
} from "./AgentPitch";

afterEach(cleanup);

describe("AiNativeThesis", () => {
  it("states the thesis with its chart, as a section rather than the page title", () => {
    render(<AiNativeThesis />);
    // The copy is the copy that used to be the hero — unchanged. What moved is
    // the heading level: this argues for choosing Gwinn, it doesn't name it.
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading.textContent).toContain(AI_NATIVE_PITCH.headline);
    expect(heading.textContent).toContain(AI_NATIVE_PITCH.headlineEmphasis);
    expect(screen.getByText(AI_NATIVE_PITCH.eyebrow)).toBeTruthy();
    expect(screen.getByText(AI_NATIVE_PITCH.body)).toBeTruthy();
    // The chart is its own component (and, in the reel, its own panel) — see
    // DiscoveryShiftChart below.
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
    expect(screen.getByText(/bergblume\.gwinn\.ch\/mcp/i)).toBeTruthy();
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

  it("becomes a statement band of its own in its dense reel rendering", () => {
    // The homepage reel puts the thesis beside a market day rather than in a
    // band of its own, and on a phone the thesis and its chart are a panel
    // each — so `dense` carries the band ground that a light chapter can't lend.
    const { container } = render(<AiNativeThesis dense />);
    expect(container.querySelector("section")).toBeNull();
    expect(screen.getByTestId("ai-native-band").className).toContain("bg-band");
    // Dense takes the short thesis: the long one narrates the chart beside it
    // and then adds a claim about the future that /why-gwinn is for.
    expect(screen.getByText(AI_NATIVE_PITCH.bodyShort)).toBeTruthy();
    expect(screen.queryByText(AI_NATIVE_PITCH.body)).toBeNull();
  });

  it("gives the chart its own band when it is a panel of its own", () => {
    const { container } = render(<DiscoveryShiftChart dense />);
    expect(container.firstElementChild?.className).toContain("bg-band");
  });

  it("labels the crossing on the drawing instead of captioning it", () => {
    // A paragraph saying two lines cross is a redundant caption. On the reel
    // the label goes on the curve; off it, the caption still earns its place.
    render(<DiscoveryShiftChart dense />);
    expect(screen.getByText(AI_NATIVE_PITCH.chart.crossingLabel)).toBeTruthy();
    expect(screen.queryByText(AI_NATIVE_PITCH.chart.caption)).toBeNull();

    cleanup();
    render(<DiscoveryShiftChart />);
    expect(screen.getByText(AI_NATIVE_PITCH.chart.caption)).toBeTruthy();
  });

  it("tells a screen reader where the curves cross, not just that they do", () => {
    // The label is <text> inside the svg, which the image role swallows — so
    // the crossing has to reach the accessible name too or it is sighted-only.
    render(<DiscoveryShiftChart dense />);
    const chart = screen.getByRole("img");
    expect(chart.getAttribute("aria-label")).toContain(
      AI_NATIVE_PITCH.chart.crossingLabel,
    );
  });

  it("caps the chart's width while it is a slide", () => {
    // The svg is `w-full` over a 1.8 aspect, so an uncapped slide on a 1280px
    // laptop — wide, but not tall enough for the desktop columns — draws a
    // 684px-tall chart and the slide starts scrolling inside itself. The
    // reel-mode column bounds it, so the cap lifts there.
    const { container } = render(<DiscoveryShiftChart dense />);
    const frame = container.firstElementChild!;
    expect(frame.className).toContain("max-w-xl");
    expect(frame.className).toContain("reel:max-w-none");
  });
});
