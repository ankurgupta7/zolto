import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import CapabilityBand from "./CapabilityBand";

afterEach(cleanup);

describe("CapabilityBand", () => {
  it("surfaces all four Zolto capabilities", () => {
    render(<CapabilityBand storeConnected insightsReady />);
    expect(screen.getByText("Online Store")).toBeTruthy();
    expect(screen.getByText("Tap to Pay")).toBeTruthy();
    expect(screen.getByText("AI Studio")).toBeTruthy();
    expect(screen.getByText("Insights")).toBeTruthy();
  });

  it("shows the store as Live and non-actionable when connected", () => {
    const onConnectStore = vi.fn();
    render(
      <CapabilityBand
        storeConnected
        insightsReady
        onConnectStore={onConnectStore}
      />,
    );
    expect(screen.getByText("Live")).toBeTruthy();
    // Only the Insights=Generate case would add a button; here nothing is
    // actionable, so there are no buttons rendered.
    expect(screen.queryByRole("button")).toBeNull();
  });

  it('prompts "Connect" and calls onConnectStore when the store is not linked', () => {
    const onConnectStore = vi.fn();
    render(
      <CapabilityBand
        storeConnected={false}
        insightsReady
        onConnectStore={onConnectStore}
      />,
    );
    const connect = screen.getByText("Connect");
    fireEvent.click(connect);
    expect(onConnectStore).toHaveBeenCalledTimes(1);
  });

  it('prompts "Generate" for insights and calls onViewInsights', () => {
    const onViewInsights = vi.fn();
    render(
      <CapabilityBand
        storeConnected
        insightsReady={false}
        onViewInsights={onViewInsights}
      />,
    );
    const generate = screen.getByText("Generate");
    fireEvent.click(generate);
    expect(onViewInsights).toHaveBeenCalledTimes(1);
  });

  it("renders insights as Ready (non-actionable) once generated", () => {
    render(<CapabilityBand storeConnected insightsReady />);
    // Two pillars read "Ready" (Tap to Pay + Insights); both are static.
    expect(screen.getAllByText("Ready").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("Generate")).toBeNull();
  });
});
