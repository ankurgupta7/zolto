import { Link } from "wouter";
import { SketchUnderline } from "@/components/SketchAccents";
import { Container } from "../components/Container";
import { useDocumentMeta } from "../lib/useDocumentMeta";
import { useMarketingT } from "../lib/marketingI18n";

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
  { href: "/", key: "home" },
  { href: "/pricing", key: "pricing" },
  { href: "/faq", key: "faq" },
] as const;

export default function NotFound() {
  const { t } = useMarketingT();

  useDocumentMeta({
    title: t("notFound.metaTitle"),
    description: t("notFound.metaDescription"),
    path: "/404",
    noindex: true,
  });

  return (
    <Container width="3xl" className="py-24 text-center">
      <p className="font-hand text-2xl leading-none text-[var(--brand-accent)]">
        {t("notFound.eyebrow")}
      </p>

      <h1 className="mt-3 font-serif text-4xl text-[var(--brand-text)]">
        <span className="relative inline-block">
          {t("notFound.heading")}
          <span
            aria-hidden
            className="absolute -bottom-2 left-0 w-full text-[var(--brand-accent)]"
          >
            <SketchUnderline />
          </span>
        </span>
      </h1>

      <p className="mx-auto mt-8 max-w-md leading-relaxed text-[var(--brand-muted-2)]">
        {t("notFound.body")}
      </p>

      <ul className="mx-auto mt-10 grid max-w-md gap-3 text-left">
        {EXITS.map((exit) => (
          <li key={exit.href}>
            <Link
              href={exit.href}
              className="group flex items-baseline justify-between gap-4 rounded-xl border border-[var(--brand-border)] bg-white px-5 py-4 transition-colors hover:border-[var(--brand-accent)]/60"
            >
              <span className="font-serif text-lg text-[var(--brand-text)] transition-colors group-hover:text-[var(--brand-accent)]">
                {t(`notFound.exits.${exit.key}.label`)}
              </span>
              <span className="text-right text-xs text-[var(--brand-muted)]">
                {t(`notFound.exits.${exit.key}.hint`)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Container>
  );
}
