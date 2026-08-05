import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import i18n from "@/lib/i18n";
import ImageLightbox from "./ImageLightbox";

const IMAGES = ["/img/a.jpg", "/img/b.jpg", "/img/c.jpg"];

const handlers = {
  onClose: vi.fn(),
  onNext: vi.fn(),
  onPrev: vi.fn(),
  onGoTo: vi.fn(),
};

function renderLightbox(images = IMAGES, activeIndex = 0) {
  return render(
    <ImageLightbox images={images} activeIndex={activeIndex} {...handlers} />,
  );
}

// The storefront falls back to German when the browser asks for it; pin
// English so the label assertions below read the source strings.
beforeEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage("en");
});
afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

describe("ImageLightbox", () => {
  it("shows the active image with its position in the set", () => {
    renderLightbox(IMAGES, 1);
    const img = screen.getByAltText("View 2 of 3") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("/img/b.jpg");
    expect(screen.getByText("2 / 3")).toBeTruthy();
  });

  it("locks body scroll while open and restores it on unmount", () => {
    const { unmount } = renderLightbox();
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("closes via the close button", () => {
    renderLightbox();
    fireEvent.click(screen.getByLabelText("Close"));
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on a backdrop click but not on a click on the image", () => {
    renderLightbox();
    fireEvent.click(screen.getByAltText("View 1 of 3"));
    expect(handlers.onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("dialog"));
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
  });

  it("navigates with the arrow buttons without closing", () => {
    renderLightbox();
    fireEvent.click(screen.getByLabelText("Next image"));
    expect(handlers.onNext).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByLabelText("Previous image"));
    expect(handlers.onPrev).toHaveBeenCalledTimes(1);
    expect(handlers.onClose).not.toHaveBeenCalled();
  });

  it("jumps straight to an image via its dot", () => {
    renderLightbox();
    fireEvent.click(screen.getByLabelText("Go to image 3"));
    expect(handlers.onGoTo).toHaveBeenCalledWith(2);
    expect(handlers.onClose).not.toHaveBeenCalled();
  });

  it("responds to Escape and the arrow keys", () => {
    renderLightbox();
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(handlers.onNext).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: "ArrowLeft" });
    expect(handlers.onPrev).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
  });

  it("hides navigation entirely for a single image", () => {
    renderLightbox(["/img/only.jpg"]);
    expect(screen.queryByLabelText("Next image")).toBeNull();
    expect(screen.queryByLabelText("Previous image")).toBeNull();
    expect(screen.queryByText("1 / 1")).toBeNull();
    // Arrow keys are inert too — there is nowhere to go.
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(handlers.onNext).not.toHaveBeenCalled();
  });
});
