import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Container } from "./Container";

afterEach(cleanup);

describe("Container (marketing gutter primitive)", () => {
  it("centres content and applies the surface gutter by default", () => {
    render(<Container data-testid="c">content</Container>);
    const el = screen.getByTestId("c");
    expect(el.className).toContain("mx-auto");
    expect(el.className).toContain("px-6");
    // Wide page sections are the default width.
    expect(el.className).toContain("max-w-6xl");
  });

  it("maps each width token to its Tailwind max-width", () => {
    const widths = ["md", "xl", "2xl", "3xl", "4xl", "5xl", "6xl"] as const;
    for (const w of widths) {
      cleanup();
      render(
        <Container width={w} data-testid="c">
          content
        </Container>,
      );
      expect(screen.getByTestId("c").className).toContain(`max-w-${w}`);
    }
  });

  it("renders a div by default and honours the `as` element", () => {
    const { container } = render(<Container>plain</Container>);
    expect(container.firstElementChild?.tagName).toBe("DIV");

    cleanup();
    const { container: sectionEl } = render(
      <Container as="section">section</Container>,
    );
    expect(sectionEl.firstElementChild?.tagName).toBe("SECTION");

    cleanup();
    const { container: articleEl } = render(
      <Container as="article">article</Container>,
    );
    expect(articleEl.firstElementChild?.tagName).toBe("ARTICLE");
  });

  it("forwards arbitrary props (so anchor targets like #product survive)", () => {
    render(
      <Container as="section" id="product" data-testid="c">
        content
      </Container>,
    );
    expect(screen.getByTestId("c").getAttribute("id")).toBe("product");
  });

  it("lets a caller override the gutter and width via className", () => {
    render(
      <Container width="6xl" className="max-w-3xl px-0" data-testid="c" />,
    );
    const cls = screen.getByTestId("c").className;
    // tailwind-merge resolves the conflicts in the caller's favour.
    expect(cls).toContain("max-w-3xl");
    expect(cls).not.toContain("max-w-6xl");
    expect(cls).toContain("px-0");
    expect(cls).not.toContain("px-6");
  });
});
