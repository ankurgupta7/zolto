/**
 * Screenshot entry for the "built by AI, for AI" pitch PROPOSALS.
 *
 * Three candidate hero directions plus a shared "how an AI buys from you"
 * band, rendered against the real index.css and brand tokens so the shots
 * are what the page would actually look like. Nothing here is routed in the
 * app — these are mocks for picking a direction, not shipped UI.
 *
 *   npx vite --config tools/screenshot/vite.config.ts &
 *   SHOT_URL=http://localhost:5199/pitch.html node tools/screenshot/shoot.mjs out/ \
 *     "VARIANT A" "VARIANT B" "VARIANT C" "HOW AN AI BUYS"
 */

import { createRoot } from "react-dom/client";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import "./entry.css";
import { SketchUnderline } from "@/components/SketchAccents";

const { hook } = memoryLocation({ path: "/", static: true });

/* ── Shared: the agent-purchase chat mock ─────────────────────────────── */

function AgentChatMock() {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/15 bg-white shadow-[0_24px_60px_-30px_rgba(0,0,0,0.6)]">
      <div className="flex items-center gap-2.5 border-b border-[var(--brand-border)] px-5 py-3">
        <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
        <span className="text-[13px] text-[var(--brand-muted)]">
          Your customer&rsquo;s AI assistant
        </span>
      </div>
      <div className="grid gap-3 px-5 py-5">
        {/* customer asks */}
        <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-[var(--brand-ink)] px-4 py-2.5 text-[14px] leading-relaxed text-white">
          Find me a handmade ceramic mug under CHF 40 that ships to Zürich by
          Friday.
        </div>
        {/* assistant answers with a product from a Zolto store */}
        <div className="max-w-[92%] rounded-2xl rounded-bl-md bg-[var(--brand-surface-2,#f1ece4)] px-4 py-3 text-[14px] leading-relaxed text-[var(--brand-text)]">
          Bergblume Keramik, a small studio in Bern, has the{" "}
          <span className="font-medium">Alpine Glaze Mug</span> — hand-thrown,
          CHF 38, 3 in stock, ships tomorrow.
          <div className="mt-2.5 flex items-center gap-3 rounded-lg border border-[var(--brand-border)] bg-white px-3 py-2.5">
            <span
              aria-hidden
              className="h-10 w-10 flex-none rounded-md bg-gradient-to-br from-[#d9c9a3] to-[var(--brand-accent)]"
            />
            <span className="min-w-0">
              <span className="block font-serif text-[15px]">
                Alpine Glaze Mug
              </span>
              <span className="text-[12px] text-[var(--brand-muted)] lining-nums">
                CHF 38 · 3 in stock · bergblume.zolto.ch
              </span>
            </span>
          </div>
          Want me to order it?
        </div>
        {/* customer confirms */}
        <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-[var(--brand-ink)] px-4 py-2.5 text-[14px] text-white">
          Yes — order it.
        </div>
        {/* the sale happens inside the conversation */}
        <div className="max-w-[92%] rounded-2xl rounded-bl-md bg-[var(--brand-surface-2,#f1ece4)] px-4 py-3 text-[14px] text-[var(--brand-text)]">
          <span className="font-medium text-emerald-700">Order placed ✓</span>{" "}
          — confirmation sent. Paid straight into the maker&rsquo;s Stripe.
        </div>
        <p className="mt-1 text-center font-mono text-[11px] tracking-tight text-[var(--brand-muted)]">
          live stock &amp; checkout via bergblume.zolto.ch/mcp
        </p>
      </div>
    </div>
  );
}

/* ── Shared: schematic "where discovery happens" chart ────────────────── */

function DiscoveryShiftChart() {
  return (
    <div className="rounded-2xl border border-white/15 bg-white/[0.04] p-7">
      <p className="text-[11px] uppercase tracking-[0.2em] text-white/45">
        where buyers start their search
      </p>
      <svg
        viewBox="0 0 360 200"
        className="mt-4 w-full"
        role="img"
        aria-label="Search declining, AI assistants rising"
      >
        {/* axis */}
        <line x1="8" y1="180" x2="352" y2="180" stroke="rgba(255,255,255,0.25)" />
        {/* search engines: high, sliding down */}
        <path
          d="M8 40 C 120 48, 220 90, 352 150"
          fill="none"
          stroke="rgba(255,255,255,0.35)"
          strokeWidth="2.5"
          strokeDasharray="6 5"
        />
        <text x="14" y="30" fill="rgba(255,255,255,0.45)" fontSize="12">
          search engines
        </text>
        {/* AI assistants: low, curving up */}
        <path
          d="M8 168 C 140 160, 240 110, 352 34"
          fill="none"
          stroke="#d4b45c"
          strokeWidth="3"
        />
        <text x="235" y="60" fill="#d4b45c" fontSize="12" fontWeight="600">
          AI assistants
        </text>
        <text x="8" y="196" fill="rgba(255,255,255,0.35)" fontSize="11">
          2023
        </text>
        <text x="330" y="196" fill="rgba(255,255,255,0.35)" fontSize="11">
          2027
        </text>
      </svg>
      <p className="mt-4 text-sm leading-relaxed text-white/60">
        Assistants only recommend stores they can read. A store that&rsquo;s
        invisible to them isn&rsquo;t in the answer — no matter how good its
        SEO was.
      </p>
    </div>
  );
}

/* ── Shared: the "out of the box" card (variant C sidebar) ────────────── */

function AgentSurfaceCard() {
  return (
    <div className="rounded-2xl border border-white/15 bg-white/[0.04] p-7">
      <p className="text-[11px] uppercase tracking-[0.2em] text-white/45">
        every store ships with, from day one
      </p>
      <ul className="mt-5 grid gap-3.5">
        {[
          ["llms.txt", "a plain-language brief AI assistants read first"],
          ["MCP endpoint", "live products, stock and prices — no stale scrape"],
          ["Agent checkout", "customers buy without leaving the chat"],
          ["Store chat", "answers on materials, sizing and shipping"],
        ].map(([name, desc]) => (
          <li key={name} className="flex gap-3 text-sm leading-relaxed">
            <span aria-hidden className="text-[var(--brand-accent)]">
              ✓
            </span>
            <span className="text-white/75">
              <span className="font-medium text-white">{name}</span> — {desc}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-6 border-t border-white/10 pt-4 text-sm text-white/55">
        On the Free plan too. Nothing to configure, nothing to install —
        and 1% only when an agent actually sells for you.
      </p>
    </div>
  );
}

/* ── Variant A — the category claim ───────────────────────────────────── */

function VariantA() {
  return (
    <section className="bg-[var(--brand-ink)]">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 pb-20 pt-16 sm:px-6 md:grid-cols-2">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/40">
            VARIANT A
          </p>
          <p className="mt-6 font-hand text-2xl leading-none text-[var(--brand-accent)]">
            the first commerce platform that speaks AI
          </p>
          <h1 className="mt-4 max-w-xl font-serif text-4xl leading-[1.1] text-white sm:text-5xl">
            Built by AI.{" "}
            <span className="relative inline-block">
              For AI.
              <span className="absolute -bottom-2 left-0 w-full text-[var(--brand-accent)]">
                <SketchUnderline />
              </span>
            </span>
          </h1>
          <p className="mt-8 max-w-md text-lg leading-relaxed text-white/70">
            Your customers already ask ChatGPT and Claude where to buy. Every
            Zolto store ships an <span className="text-white">llms.txt</span>,
            an <span className="text-white">MCP endpoint</span> and{" "}
            <span className="text-white">agent checkout</span> out of the box —
            so when an AI goes shopping for your customer, your shop is one it
            can actually walk into.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <span className="rounded-md bg-[var(--brand-accent)] px-7 py-3 text-xs font-medium uppercase tracking-[0.14em] text-[var(--brand-ink)]">
              Start free →
            </span>
            <span className="rounded-md border border-white/25 px-7 py-3 text-xs font-medium uppercase tracking-[0.14em] text-white/85">
              See how agents buy
            </span>
          </div>
        </div>
        <AgentChatMock />
      </div>
    </section>
  );
}

/* ── Variant B — discovery over time ──────────────────────────────────── */

function VariantB() {
  return (
    <section className="bg-[var(--brand-ink)]">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 pb-20 pt-16 sm:px-6 md:grid-cols-2">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/40">
            VARIANT B
          </p>
          <p className="mt-6 font-hand text-2xl leading-none text-[var(--brand-accent)]">
            commerce is moving into the chat window
          </p>
          <h1 className="mt-4 max-w-xl font-serif text-4xl leading-[1.1] text-white sm:text-5xl">
            Your next customer{" "}
            <span className="relative inline-block">
              is an AI.
              <span className="absolute -bottom-2 left-0 w-full text-[var(--brand-accent)]">
                <SketchUnderline />
              </span>
            </span>
          </h1>
          <p className="mt-8 max-w-md text-lg leading-relaxed text-white/70">
            Search built the last era of shops. Assistants are building this
            one — and they can only recommend stores they can read. Websites
            retrofitted for yesterday&rsquo;s crawlers fade out of the answers;
            a Zolto store is a{" "}
            <span className="text-white">native speaker</span>: llms.txt, MCP
            and agent checkout on every store, kept current as the protocols
            move, so your discoverability compounds instead of decaying.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <span className="rounded-md bg-[var(--brand-accent)] px-7 py-3 text-xs font-medium uppercase tracking-[0.14em] text-[var(--brand-ink)]">
              Start free →
            </span>
            <span className="rounded-md border border-white/25 px-7 py-3 text-xs font-medium uppercase tracking-[0.14em] text-white/85">
              Ask your AI about us
            </span>
          </div>
        </div>
        <DiscoveryShiftChart />
      </div>
    </section>
  );
}

/* ── Variant C — maker warmth, agents added ───────────────────────────── */

function VariantC() {
  return (
    <section className="bg-[var(--brand-ink)]">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 pb-20 pt-16 sm:px-6 md:grid-cols-2">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/40">
            VARIANT C
          </p>
          <p className="mt-6 font-hand text-2xl leading-none text-[var(--brand-accent)]">
            for people who make things
          </p>
          <h1 className="mt-4 max-w-xl font-serif text-4xl leading-[1.1] text-white sm:text-5xl">
            A shop humans and AIs{" "}
            <span className="relative inline-block">
              can both walk into.
              <span className="absolute -bottom-2 left-0 w-full text-[var(--brand-accent)]">
                <SketchUnderline />
              </span>
            </span>
          </h1>
          <p className="mt-8 max-w-md text-lg leading-relaxed text-white/70">
            Your stall, your website — and now the chat window. Zolto is a
            point-of-sale and an online store on{" "}
            <span className="text-white">one inventory</span>, built by AI so
            AI can shop there too: every store ships llms.txt, MCP and agent
            checkout, so assistants can find, recommend and buy your work
            while you&rsquo;re busy at the market.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <span className="rounded-md bg-[var(--brand-accent)] px-7 py-3 text-xs font-medium uppercase tracking-[0.14em] text-[var(--brand-ink)]">
              Start free →
            </span>
            <span className="rounded-md border border-white/25 px-7 py-3 text-xs font-medium uppercase tracking-[0.14em] text-white/85">
              See pricing
            </span>
          </div>
        </div>
        <AgentSurfaceCard />
      </div>
    </section>
  );
}

/* ── Shared band — how an AI buys from you ────────────────────────────── */

function HowAnAiBuys() {
  const steps = [
    {
      k: "Found",
      title: "The assistant reads your brief",
      body: "Every store publishes yourstore.zolto.ch/llms.txt — a plain-language summary of who you are and what you sell, written for AI readers.",
    },
    {
      k: "Asked",
      title: "It checks live stock over MCP",
      body: "Real products, real prices, real quantities — straight from your inventory, not a stale scrape from last month.",
    },
    {
      k: "Bought",
      title: "It checks out in the chat",
      body: "The order lands like any other sale: stock syncs, you get the notification, and the money goes straight into your Stripe.",
    },
  ];
  return (
    <section className="bg-[var(--brand-surface,#f7f3ee)]">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
        <p className="text-center font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--brand-muted)]">
          SHARED BAND — HOW AN AI BUYS
        </p>
        <div className="mb-12 mt-6 text-center">
          <p className="font-hand text-2xl leading-none text-[var(--brand-accent)]">
            no setup, no plugin, no agency
          </p>
          <h2 className="mt-2 font-serif text-3xl text-[var(--brand-text)]">
            How an AI buys from you.
          </h2>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {steps.map((s, i) => (
            <div
              key={s.k}
              className="rounded-2xl border border-[var(--brand-border)] bg-white p-7 shadow-[0_18px_44px_-34px_rgba(45,38,32,0.5)]"
            >
              <p className="font-hand text-xl text-[var(--brand-accent)]">
                {i + 1}. {s.k}
              </p>
              <h3 className="mt-2 font-serif text-xl text-[var(--brand-text)]">
                {s.title}
              </h3>
              <p className="mt-3 text-[15px] leading-relaxed text-[var(--brand-muted-2)]">
                {s.body}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-10 text-center text-sm text-[var(--brand-muted)]">
          You don&rsquo;t set any of this up. It ships with the store — on the
          Free plan too.
        </p>
      </div>
    </section>
  );
}

createRoot(document.getElementById("root")!).render(
  <Router hook={hook}>
    <div className="bg-[var(--brand-ground)] font-sans text-[var(--brand-text)]">
      <VariantA />
      <div className="h-10 bg-[var(--brand-ground)]" />
      <VariantB />
      <div className="h-10 bg-[var(--brand-ground)]" />
      <VariantC />
      <div className="h-10 bg-[var(--brand-ground)]" />
      <HowAnAiBuys />
    </div>
  </Router>,
);
