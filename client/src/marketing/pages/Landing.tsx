import { Link } from "wouter";

const FEATURES = [
  {
    title: "POS + online, one inventory",
    body: "Sell at the market and online from the same catalog. Stock stays in sync in real time — no double entry, no oversells.",
  },
  {
    title: "AI that does the busywork",
    body: "Snap a photo, get a product description. Ask a question, get an answer. The assistant drafts listings, handles support, and speeds up setup.",
  },
  {
    title: "Built for makers, not chains",
    body: "Designed for the person who sells at craft fairs and pop-ups — not a store manager. Set up in an afternoon, sell the same day.",
  },
];

export default function Landing() {
  return (
    <>
      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pb-20 pt-24 text-center">
        <span className="inline-block rounded-full bg-violet-500/10 px-3 py-1 text-xs font-medium uppercase tracking-widest text-violet-300">
          AI-run commerce for makers
        </span>
        <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-6xl">
          Sell online and in person, without managing technology.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-300">
          Zolto gives makers and artisans a point-of-sale and an online store
          that share one inventory — with an AI assistant that handles the
          setup, the listings, and the support.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/signup"
            className="rounded-lg bg-violet-500 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-violet-400"
          >
            Start free →
          </Link>
          <Link
            href="/pricing"
            className="rounded-lg border border-slate-700 px-6 py-3 text-sm font-medium text-slate-200 transition-colors hover:border-slate-500 hover:text-white"
          >
            See pricing
          </Link>
        </div>
      </section>

      {/* Features */}
      <section
        id="product"
        className="border-t border-slate-800 bg-slate-900/40 py-20"
      >
        <div className="mx-auto grid max-w-6xl gap-8 px-6 md:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-slate-800 bg-slate-900 p-8"
            >
              <h3 className="text-lg font-semibold text-white">{f.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-300">
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-4xl px-6 py-24 text-center">
        <h2 className="text-3xl font-semibold text-white">
          Your store, live this week.
        </h2>
        <p className="mt-4 text-slate-300">
          Free to start. 14-day trial on paid plans. No card required to
          explore.
        </p>
        <Link
          href="/signup"
          className="mt-8 inline-block rounded-lg bg-violet-500 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-violet-400"
        >
          Create your store →
        </Link>
      </section>
    </>
  );
}
