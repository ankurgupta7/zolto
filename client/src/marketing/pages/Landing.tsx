import { Link } from "wouter";
import { SketchUnderline } from "@/components/SketchAccents";
import {
  OneInventoryDiagram,
  PhotoToListing,
  MarketStallScene,
} from "../components/MarketingIllustrations";

export default function Landing() {
  return (
    <>
      {/* ── Hero — warm mahogany band, the storefront's own hero treatment ── */}
      <section className="bg-[var(--brand-ink)]">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 pb-20 pt-20 md:grid-cols-2">
          <div>
            <p className="font-hand text-2xl leading-none text-[var(--brand-accent)]">
              For people who make things
            </p>
            <h1 className="mt-4 max-w-xl font-serif text-4xl leading-[1.1] text-white sm:text-5xl">
              Sell online and in person, without{" "}
              <span className="relative inline-block">
                managing technology.
                <span className="absolute -bottom-2 left-0 w-full text-[var(--brand-accent)]">
                  <SketchUnderline />
                </span>
              </span>
            </h1>
            <p className="mt-8 max-w-md text-lg leading-relaxed text-white/70">
              Zolto gives makers a point-of-sale and an online store that share{" "}
              <span className="text-white">one inventory</span> — with an AI
              assistant that handles the setup, the listings, and the support.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Link
                href="/signup"
                className="rounded-md bg-[var(--brand-accent)] px-7 py-3 text-xs font-medium uppercase tracking-[0.14em] text-[var(--brand-ink)] transition-colors hover:bg-[var(--brand-accent-light)]"
              >
                Start free →
              </Link>
              <Link
                href="/pricing"
                className="rounded-md border border-white/25 px-7 py-3 text-xs font-medium uppercase tracking-[0.14em] text-white/85 transition-colors hover:border-white hover:text-white"
              >
                See pricing
              </Link>
            </div>
          </div>

          {/* Line-drawn market stall — the product's world, not stock art */}
          <div className="hidden justify-center text-[var(--brand-accent)]/80 md:flex">
            <MarketStallScene className="w-full max-w-md" />
          </div>
        </div>
      </section>

      {/* ── Proof strip ── */}
      <section className="border-b border-[var(--brand-border)] bg-[var(--brand-surface)]">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-6 py-8 text-center sm:flex-row sm:justify-between sm:text-left">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--brand-muted)]">
            Handmade in Zürich · built with real makers
          </p>
          <blockquote className="font-serif text-lg italic text-[var(--brand-text)]">
            “I set up my whole shop the afternoon before a fair.”
          </blockquote>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="product" className="mx-auto max-w-6xl px-6 py-20">
        <div className="mb-14 text-center">
          <p className="font-hand text-2xl leading-none text-[var(--brand-accent)]">
            here&rsquo;s how it works
          </p>
          <h2 className="mt-2 font-serif text-3xl text-[var(--brand-text)]">
            One shop. Everywhere you sell.
          </h2>
        </div>

        {/* Feature 1 — one inventory, two channels */}
        <div className="grid items-center gap-10 md:grid-cols-[0.8fr_1.2fr]">
          <div>
            <h3 className="font-serif text-2xl text-[var(--brand-text)]">
              One inventory, two channels
            </h3>
            <p className="mt-3 max-w-sm leading-relaxed text-[var(--brand-muted-2)]">
              Sell at the market and online from the same catalogue. Sell the
              last one at your stall and it comes off the website in real time —
              no double entry, no oversells.
            </p>
          </div>
          <OneInventoryDiagram />
        </div>

        {/* Feature 2 — photo to listing */}
        <div className="mt-20 grid items-center gap-10 md:grid-cols-[0.8fr_1.2fr]">
          <div className="md:order-2">
            <h3 className="font-serif text-2xl text-[var(--brand-text)]">
              Snap a photo, get a listing
            </h3>
            <p className="mt-3 max-w-sm leading-relaxed text-[var(--brand-muted-2)]">
              Photograph a piece and the AI drafts the title, description and a
              suggested price. You review and publish — the busywork is done for
              you.
            </p>
          </div>
          <div className="md:order-1">
            <PhotoToListing />
          </div>
        </div>

        {/* Feature 3 — built for makers */}
        <div className="mt-20 rounded-xl border border-[var(--brand-border)] bg-white p-8 text-center md:p-12">
          <h3 className="font-serif text-2xl text-[var(--brand-text)]">
            Built for makers, not chains
          </h3>
          <p className="mx-auto mt-3 max-w-xl leading-relaxed text-[var(--brand-muted-2)]">
            Designed for the person who sells at craft fairs and pop-ups — not a
            store manager with an ops team. Card, cash and TWINT payments are
            handled for you, securely. You make the work; Zolto handles the
            technology.
          </p>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="bg-[var(--brand-ink)]">
        <div className="mx-auto max-w-4xl px-6 py-20 text-center">
          <p className="font-hand text-2xl leading-none text-[var(--brand-accent)]">
            ready when you are
          </p>
          <h2 className="mt-3 font-serif text-3xl text-white sm:text-4xl">
            Your store, live this week.
          </h2>
          <p className="mt-4 text-white/70">
            Free to start. 14-day trial on paid plans. No card required to
            explore.
          </p>
          <Link
            href="/signup"
            className="mt-8 inline-block rounded-md bg-[var(--brand-accent)] px-7 py-3 text-xs font-medium uppercase tracking-[0.14em] text-[var(--brand-ink)] transition-colors hover:bg-[var(--brand-accent-light)]"
          >
            Create your store →
          </Link>
        </div>
      </section>
    </>
  );
}
