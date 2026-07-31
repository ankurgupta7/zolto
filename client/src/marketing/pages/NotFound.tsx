import { Link } from "wouter";
import { SketchUnderline } from "@/components/SketchAccents";
import { Container } from "../components/Container";
import { useDocumentMeta } from "../lib/useDocumentMeta";

/**
 * The marketing site's 404.
 *
 * A dead link is the one page nobody chose to visit, which makes it the page
 * most likely to read as "this company is sloppy". Since the whole positioning
 * rests on being straight with people, it says plainly that the page isn't
 * there, doesn't blame the visitor for the URL, and hands them the three
 * destinations that actually answer why they came.
 *
 * `noindex` so a mistyped URL can't end up in search results standing in for
 * the real page.
 */

const EXITS = [
  {
    href: "/",
    label: "The homepage",
    hint: "What Zolto is, in about a minute",
  },
  { href: "/pricing", label: "Pricing", hint: "Free in person. 1% online." },
  { href: "/faq", label: "FAQ", hint: "The questions makers actually ask" },
];

export default function NotFound() {
  useDocumentMeta({
    title: "Page not found | Zolto",
    description:
      "That page isn't here. Try the homepage, pricing, or the FAQ instead.",
    path: "/404",
    noindex: true,
  });

  return (
    <Container width="3xl" className="py-24 text-center">
      <p className="font-hand text-2xl leading-none text-[var(--brand-accent)]">
        well, this stall&rsquo;s empty
      </p>

      <h1 className="mt-3 font-serif text-4xl text-[var(--brand-text)]">
        <span className="relative inline-block">
          There&rsquo;s nothing on this page.
          <span
            aria-hidden
            className="absolute -bottom-2 left-0 w-full text-[var(--brand-accent)]"
          >
            <SketchUnderline />
          </span>
        </span>
      </h1>

      <p className="mx-auto mt-8 max-w-md leading-relaxed text-[var(--brand-muted-2)]">
        Could be a typo, could be a link we moved and forgot to redirect. If
        it&rsquo;s the second one, that&rsquo;s on us. Here&rsquo;s where
        everyone else was going:
      </p>

      <ul className="mx-auto mt-10 grid max-w-md gap-3 text-left">
        {EXITS.map((exit) => (
          <li key={exit.href}>
            <Link
              href={exit.href}
              className="group flex items-baseline justify-between gap-4 rounded-xl border border-[var(--brand-border)] bg-white px-5 py-4 transition-colors hover:border-[var(--brand-accent)]/60"
            >
              <span className="font-serif text-lg text-[var(--brand-text)] transition-colors group-hover:text-[var(--brand-accent)]">
                {exit.label}
              </span>
              <span className="text-right text-xs text-[var(--brand-muted)]">
                {exit.hint}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Container>
  );
}
