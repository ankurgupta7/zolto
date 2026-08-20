import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { SketchUnderline } from "@/components/SketchAccents";

/**
 * The storefront's 404 — a shopper's dead end, not a developer's.
 *
 * This is a *tenant* page: the visitor thinks they are in a maker's shop, not
 * on Gwinn, so it wears the storefront's own oyster/gold/ink brand rather than
 * platform chrome, and the voice stays the shop's — warm and a little wry,
 * never a stack trace. It is translated like every other shopper-facing string
 * (the storefront ships de/en), because a German-speaking customer hitting a
 * bad link is exactly the moment not to fall back to English.
 *
 * Both exits are offered on purpose: someone who mistyped a product URL wants
 * the shop, someone who followed a stale link wants the front page.
 */
export default function NotFound() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-[70vh] w-full items-center justify-center bg-[var(--brand-ground)] px-4 py-20">
      <div className="w-full max-w-lg text-center">
        <p className="font-hand text-2xl leading-none text-[var(--brand-accent)]">
          {t("notFound.eyebrow")}
        </p>

        <h1 className="mt-3 font-serif text-3xl text-[var(--brand-text)] sm:text-4xl">
          <span className="relative inline-block">
            {t("notFound.title")}
            <span
              aria-hidden
              className="absolute -bottom-2 left-0 w-full text-[var(--brand-accent)]"
            >
              <SketchUnderline />
            </span>
          </span>
        </h1>

        <p className="mx-auto mt-8 max-w-sm leading-relaxed text-[var(--brand-muted-2)]">
          {t("notFound.body")}
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/shop"
            className="rounded-md bg-[var(--brand-accent)] px-7 py-3 text-xs font-medium uppercase tracking-[0.14em] text-[var(--brand-ink)] transition-colors hover:bg-[var(--brand-accent-light)]"
          >
            {t("notFound.shop")}
          </Link>
          <Link
            href="/"
            className="rounded-md border border-[var(--brand-ink)]/25 px-7 py-3 text-xs font-medium uppercase tracking-[0.14em] text-[var(--brand-ink)] transition-colors hover:bg-[var(--brand-ink)] hover:text-white"
          >
            {t("notFound.home")}
          </Link>
        </div>
      </div>
    </div>
  );
}
