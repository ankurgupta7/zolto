import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * The marketing surface's horizontal-rhythm primitive.
 *
 * Every marketing page used to hand-roll `mx-auto max-w-… px-6`, so the gutter
 * was restated in a dozen files and could drift between them. Section *widths*
 * stay per-section on purpose — the surface deliberately mixes a 28rem signup
 * form with a 72rem feature grid — but the centering and the gutter now live in
 * one place.
 *
 * The global `.container` utility from index.css is intentionally NOT used here:
 * it pins max-width at 1280px, which is wrong for most of these sections.
 * CLAUDE.md's guidance for that case is "use `max-w-*` with `mx-auto px-4`" —
 * this component is exactly that, with the marketing surface's 1.5rem gutter.
 */

const WIDTHS = {
  md: "max-w-md",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
  "4xl": "max-w-4xl",
  "5xl": "max-w-5xl",
  "6xl": "max-w-6xl",
} as const;

export type ContainerWidth = keyof typeof WIDTHS;

interface ContainerProps extends ComponentProps<"div"> {
  /** Content max-width. Defaults to the 6xl used by the wide page sections. */
  width?: ContainerWidth;
  /** Element to render. `section`/`article` keep page landmarks meaningful. */
  as?: "div" | "section" | "article" | "nav";
}

/**
 * `className` is merged last (via tailwind-merge), so a caller can still
 * override the gutter or width for a one-off — e.g. `className="px-0"`.
 */
export function Container({
  width = "6xl",
  as: Tag = "div",
  className,
  ...rest
}: ContainerProps) {
  return (
    <Tag className={cn("mx-auto px-6", WIDTHS[width], className)} {...rest} />
  );
}

export default Container;
