import { Link } from "wouter";
import { SketchUnderline } from "@/components/SketchAccents";
import ParticleField from "@/components/ParticleField";
import {
  PRICING_PROMISE,
  COST_COMPARISON,
  INCUMBENT_COMPARISON,
  formatPrice,
} from "@shared/platform";
import {
  OneInventoryDiagram,
  PhotoToListing,
  MarketStallScene,
} from "../components/MarketingIllustrations";
import { Container } from "../components/Container";
import { DayInTheLife } from "../components/DayInTheLife";
import { ScrollReveal } from "../components/ScrollReveal";
import { CardReaderGag } from "../components/CardReaderGag";
import { DiaryTeaser } from "../components/DiaryTeaser";

export default function Landing() {
  return (
    <>
      {/* Ambient gold-dust layer — glows over the mahogany hero/CTA bands,
          fades out over the light sections via screen blend. */}
      <ParticleField />

      {/* ── Hero — "on your side" voice on the storefront's mahogany band ── */}
      <section className="bg-[var(--brand-ink)]">
        <Container className="grid items-center gap-10 pb-20 pt-20 md:grid-cols-2">
          <div>
            <p className="font-hand text-2xl leading-none text-[var(--brand-accent)]">
              for people who make things
            </p>
            <h1 className="mt-4 max-w-xl font-serif text-4xl leading-[1.1] text-white sm:text-5xl">
              Your whole shop, on the phone in{" "}
              <span className="relative inline-block">
                your pocket.
                <span className="absolute -bottom-2 left-0 w-full text-[var(--brand-accent)]">
                  <SketchUnderline />
                </span>
              </span>
            </h1>
            <p className="mt-8 max-w-md text-lg leading-relaxed text-white/70">
              Zolto's a point-of-sale and an online store that share{" "}
              <span className="text-white">one inventory</span> — plus an AI
              that handles the setup, the listings and the boring stuff so you
              don't have to. No card reader to buy, and{" "}
              <span className="text-white">{COST_COMPARISON.multiplier}</span>{" "}
              of what the old way charges. We're on your side. For real.
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
        </Container>
      </section>

      {/* ── Cost strip (Direction A) — a year with the old guard vs a month here ── */}
      <section className="bg-[var(--brand-ink-deep)]">
        <Container
          width="4xl"
          className="grid items-center gap-6 py-12 text-center sm:grid-cols-[1fr_auto_1fr]"
        >
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-white/45">
              {COST_COMPARISON.themLabel}
            </p>
            <p className="mt-2 font-serif text-5xl font-semibold text-white/55 tabular-nums line-through decoration-[var(--brand-accent)]/60">
              CHF {COST_COMPARISON.themPerYearChf.toLocaleString("en-US")}
            </p>
            <p className="mt-2 text-xs text-white/40">
              {COST_COMPARISON.themNote}
            </p>
          </div>
          <div
            aria-hidden
            className="text-3xl text-[var(--brand-accent)] max-sm:rotate-90"
          >
            →
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-white/45">
              {COST_COMPARISON.usLabel}
            </p>
            <p className="mt-2 font-serif text-6xl font-bold text-[var(--brand-accent-light)] tabular-nums">
              {formatPrice(COST_COMPARISON.usPerMonthChf)}
            </p>
            <p className="mt-2 text-xs text-white/40">
              {COST_COMPARISON.usNote}
            </p>
          </div>
        </Container>
      </section>

      {/* ── The pledge (Direction B) — the heart of the positioning ── */}
      <section className="border-b border-[var(--brand-border)] bg-[var(--brand-surface-2)]">
        <Container width="3xl" className="py-20">
          <ScrollReveal className="relative rounded-2xl border border-[var(--brand-border)] bg-white p-9 shadow-[0_20px_50px_-34px_rgba(45,38,32,0.4)] md:p-11">
            <span className="absolute -top-3 left-9 bg-white px-2.5 font-hand text-xl text-[var(--brand-accent)]">
              our pledge to makers
            </span>
            <p className="font-serif text-2xl leading-snug text-[var(--brand-text)] md:text-[26px]">
              &ldquo;{PRICING_PROMISE.pledge}&rdquo;
            </p>
            <ul className="mt-7 grid gap-3">
              {PRICING_PROMISE.points.map((point) => (
                <li
                  key={point}
                  className="flex gap-3 text-[15px] leading-relaxed text-[var(--brand-muted-2)]"
                >
                  <span aria-hidden className="text-[var(--brand-accent)]">
                    —
                  </span>
                  {point}
                </li>
              ))}
            </ul>
            <p className="mt-8 font-hand text-2xl text-[var(--brand-text)]">
              — the Zolto team
            </p>
          </ScrollReveal>
        </Container>
      </section>

      {/* ── Why not the old guard (Direction A) — the comparison table ── */}
      <section className="bg-[var(--brand-surface)]">
        <Container width="4xl" className="py-20">
          <div className="mb-10 text-center">
            <p className="font-hand text-2xl leading-none text-[var(--brand-accent)]">
              the honest comparison
            </p>
            <h2 className="mt-2 font-serif text-3xl text-[var(--brand-text)]">
              What you&rsquo;re actually paying them for.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-[var(--brand-muted-2)]">
              Stripe, SumUp and Worldline were built for a time when websites
              were hard and a card reader was basically a status symbol. You're
              still paying for that era — not for anything you actually need
              today.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-[15px]">
              <thead>
                <tr>
                  <th className="border-b border-[var(--brand-border)] px-4 py-3" />
                  <th className="border-b border-[var(--brand-border)] px-4 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--brand-muted)]">
                    The old guard
                  </th>
                  <th className="border-b border-[var(--brand-border)] px-4 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--brand-accent)]">
                    Zolto
                  </th>
                </tr>
              </thead>
              <tbody>
                {INCUMBENT_COMPARISON.map((row) => (
                  <tr key={row.feature}>
                    <td className="border-b border-[var(--brand-border)] px-4 py-3.5 font-medium text-[var(--brand-text)]">
                      {row.feature}
                    </td>
                    <td className="border-b border-[var(--brand-border)] px-4 py-3.5 text-[var(--brand-muted-2)]">
                      {row.them}
                    </td>
                    <td className="border-b border-[var(--brand-border)] bg-[var(--brand-accent)]/[0.07] px-4 py-3.5 font-medium text-[var(--brand-text)]">
                      <span aria-hidden className="text-[var(--brand-accent)]">
                        ✓{" "}
                      </span>
                      {row.us}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* The table's punchline, told as a joke rather than restated. */}
          <div className="mt-12">
            <CardReaderGag />
          </div>
        </Container>
      </section>

      {/* ── How it works — one inventory + photo→listing (kept illustrations) ── */}
      <Container as="section" id="product" className="py-20">
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
              suggested price — in every language you sell in. You review and
              publish; the busywork is done for you.
            </p>
          </div>
          <div className="md:order-1">
            <PhotoToListing />
          </div>
        </div>
      </Container>

      {/* ── AI-native selling loop (Direction C) — the flagship pillar ── */}
      <section className="bg-white">
        <Container className="py-20">
          <div className="mb-12 text-center">
            <p className="font-hand text-2xl leading-none text-[var(--brand-accent)]">
              AI that&rsquo;s fine with messy
            </p>
            <h2 className="mt-2 font-serif text-3xl text-[var(--brand-text)]">
              Sell first. Sort it out later.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-[var(--brand-muted-2)]">
              A real market stall is glorious chaos. Don&rsquo;t stop mid-sale
              to tag every piece — your phone&rsquo;s the card machine, the
              AI&rsquo;s the back office, and you&rsquo;re just there to sell
              cool stuff.
            </p>
          </div>

          <DayInTheLife />

          {/* End-of-day reconciliation email mock */}
          <div className="mx-auto mt-12 max-w-xl overflow-hidden rounded-xl border border-[var(--brand-border)] bg-white shadow-[0_18px_44px_-30px_rgba(45,38,32,0.5)]">
            <div className="border-b border-[var(--brand-border)] px-5 py-3.5 text-[13px] text-[var(--brand-muted)]">
              From <span className="text-[var(--brand-text)]">Zolto</span> ·
              Subject:{" "}
              <span className="text-[var(--brand-text)]">
                Your day — 2 sales to confirm
              </span>
            </div>
            <div className="px-5 py-5">
              <p className="mb-4 text-[15px] leading-relaxed text-[var(--brand-muted-2)]">
                You took CHF 165 across 2 taps today. Based on what&rsquo;s in
                stock and what usually sells at this fair, here&rsquo;s our best
                guess — tap the right piece for each:
              </p>
              {[
                {
                  name: "Baroque pearl necklace",
                  meta: "CHF 120 · 1 in stock",
                },
                { name: "Pearl drop earrings", meta: "CHF 45 · 3 in stock" },
              ].map((g) => (
                <div
                  key={g.name}
                  className="mb-2.5 flex items-center gap-3 rounded-lg border border-[var(--brand-border)] px-3.5 py-3"
                >
                  <span
                    aria-hidden
                    className="h-10 w-10 flex-none rounded-md bg-gradient-to-br from-[#d9c9a3] to-[var(--brand-accent)]"
                  />
                  <span className="min-w-0">
                    <span className="block font-serif text-[15px] text-[var(--brand-text)]">
                      {g.name}
                    </span>
                    <span className="text-[13px] text-[var(--brand-muted)]">
                      {g.meta}
                    </span>
                  </span>
                  <span className="ml-auto rounded-md bg-[var(--brand-accent)] px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--brand-ink)]">
                    That&rsquo;s it ✓
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Container>
      </section>

      {/* ── Proof you can go and check, before we ask for the signup ── */}
      <DiaryTeaser />

      {/* ── CTA ── */}
      <section className="bg-[var(--brand-ink)]">
        <Container width="4xl" className="py-20 text-center">
          <p className="font-hand text-2xl leading-none text-[var(--brand-accent)]">
            ready when you are
          </p>
          <h2 className="mt-3 font-serif text-3xl text-white sm:text-4xl">
            Your store, live this week.
          </h2>
          <p className="mt-4 text-white/70">
            Free to sell in person, forever. 14-day trial on Pro, no credit card
            needed to poke around — and no card reader, ever. Promise.
          </p>
          <Link
            href="/signup"
            className="mt-8 inline-block rounded-md bg-[var(--brand-accent)] px-7 py-3 text-xs font-medium uppercase tracking-[0.14em] text-[var(--brand-ink)] transition-colors hover:bg-[var(--brand-accent-light)]"
          >
            Create your store →
          </Link>
        </Container>
      </section>
    </>
  );
}
