import { describe, it, expect } from "vitest";
import {
  PLATFORM,
  FEATURES,
  PLANS,
  PRO_PLAN,
  PRO_BREAK_EVEN_ONLINE_CHF,
  REVENUE_SHARE,
  FAQS,
  HOW_TO_START,
  formatPrice,
  POSITIONING,
  PRICING_PROMISE,
  COST_COMPARISON,
  INCUMBENT_COMPARISON,
  SELLING_FLOW,
  monthlyCostAt,
  ZERO_COST_POS,
  AI_NATIVE_PITCH,
  FREE_PLAN,
  COMPETITORS,
  DATA_RESIDENCY,
  FAQ_CATEGORIES,
  faqsByCategory,
  SOVEREIGNTY,
  SOVEREIGNTY_STATE_LABEL,
  sovereigntyByState,
  CAPABILITIES,
  capability,
  findCompetitor,
} from "./platform";
import { source } from "./sources";
import { rate } from "./costOfAcceptance";

describe("platform facts", () => {
  it("has a name, tagline, and summary", () => {
    expect(PLATFORM.name).toBe("Zolto");
    expect(PLATFORM.tagline.length).toBeGreaterThan(0);
    expect(PLATFORM.summary.length).toBeGreaterThan(40);
  });

  it("lists features with unique ids and descriptions", () => {
    expect(FEATURES.length).toBeGreaterThanOrEqual(6);
    const ids = FEATURES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const f of FEATURES) {
      expect(f.name.length).toBeGreaterThan(0);
      expect(f.description.length).toBeGreaterThan(0);
    }
  });

  it("ships exactly two tiers: Free first, Pro highlighted", () => {
    expect(PLANS.map((p) => p.id)).toEqual(["free", "pro"]);
    expect(PLANS[0].priceChf).toBe(0);
    expect(PRO_PLAN.priceChf).toBeGreaterThan(0);
    expect(PLANS.filter((p) => p.highlight)).toEqual([PRO_PLAN]);
  });

  it("monetizes online/agent sales only — never in person", () => {
    const free = PLANS.find((p) => p.id === "free")!;
    // Free carries the skim on online + agent orders; Pro removes it.
    expect(free.onlineFeeBps).toBe(REVENUE_SHARE.freeBps);
    expect(free.onlineFeeBps).toBeGreaterThan(0);
    expect(PRO_PLAN.onlineFeeBps).toBe(0);
    // In-person is not our channel to tax, on any plan.
    expect(REVENUE_SHARE.inPersonBps).toBe(0);
    // The skim is disclosed on the Free plan card itself.
    expect(free.features.join(" | ")).toMatch(/1% platform fee/i);
  });

  it("keeps the Pro break-even at the locked upsell trigger (~CHF 2,500/mo)", () => {
    expect(PRO_BREAK_EVEN_ONLINE_CHF).toBe(
      Math.round(PRO_PLAN.priceChf / (REVENUE_SHARE.freeBps / 10_000)),
    );
    expect(PRO_BREAK_EVEN_ONLINE_CHF).toBe(2500);
  });

  it("meters on scale (products, storage) — never on AI queries", () => {
    const free = PLANS.find((p) => p.id === "free")!;
    // Scale limits exist and grow with the tier.
    expect(free.maxProducts).toBeGreaterThan(0);
    expect(PRO_PLAN.maxProducts).toBeGreaterThan(free.maxProducts);
    expect(PRO_PLAN.storageGb).toBeGreaterThan(free.storageGb);
    // Free gets a taste of AI photo generation; Pro is unmetered (null).
    expect(free.aiPhotoAllowancePerMonth).toBeGreaterThan(0);
    expect(PRO_PLAN.aiPhotoAllowancePerMonth).toBeNull();
    // No plan may reintroduce per-query AI caps ("N AI descriptions/month").
    for (const plan of PLANS) {
      expect(plan.features.join(" ")).not.toMatch(
        /\d+\s*AI descriptions?\s*\/?\s*month/i,
      );
    }
  });

  it("has FAQs and getting-started steps", () => {
    expect(FAQS.length).toBeGreaterThanOrEqual(5);
    for (const f of FAQS) {
      expect(f.q.endsWith("?")).toBe(true);
      expect(f.a.length).toBeGreaterThan(0);
    }
    expect(HOW_TO_START.length).toBeGreaterThanOrEqual(3);
  });

  it("formats prices in Swiss francs", () => {
    expect(formatPrice(0)).toBe("CHF 0");
    expect(formatPrice(19)).toBe("CHF 19");
  });

  it("names the incumbents it positions against", () => {
    expect(POSITIONING.incumbents).toContain("Stripe");
    expect(POSITIONING.incumbents).toContain("SumUp");
    expect(POSITIONING.incumbents).toContain("Worldline");
    expect(POSITIONING.shifts.length).toBe(2);
  });

  it("carries a written pricing pledge matching the fee model", () => {
    expect(PRICING_PROMISE.headline.length).toBeGreaterThan(0);
    expect(PRICING_PROMISE.pledge.toLowerCase()).toContain(
      "selling in person is free",
    );
    expect(PRICING_PROMISE.points.length).toBeGreaterThanOrEqual(3);
    const points = PRICING_PROMISE.points.join(" ");
    // The pledge and the fee constants must tell the same story.
    expect(points).toContain(REVENUE_SHARE.percentLabel);
    expect(points).toContain(String(PRO_PLAN.priceChf));
    expect(points).toContain("2,500");
  });

  it("keeps the cost comparison in sync with the highlighted plan", () => {
    const highlighted = PLANS.find((p) => p.highlight);
    expect(highlighted).toBeTruthy();
    expect(COST_COMPARISON.usPerMonthChf).toBe(highlighted?.priceChf);
    expect(COST_COMPARISON.themPerYearChf).toBeGreaterThan(
      COST_COMPARISON.usPerMonthChf * 12,
    );
  });

  it("sources the 'a year elsewhere' figure and says what it's made of", () => {
    // This number spent a long time on the landing page traceable to nothing
    // (G11 in docs/planning/ai-traffic-alignment.md). It is now twelve months
    // of a published subscription plus a published reader price, and the note
    // says so. If the source ever disappears, this fails rather than the page
    // quietly going back to asserting a number.
    expect(() => source(COST_COMPARISON.themSourceId)).not.toThrow();
    expect(COST_COMPARISON.themPerYearChf).toBe(29 * 12 + 99);
    expect(COST_COMPARISON.themNote).toMatch(/29/);
    expect(COST_COMPARISON.themNote).toMatch(/99/);
  });

  it("concedes, in the same breath, that the money buys a better card rate", () => {
    // The figure compares FIXED costs, not the cost of a sale. Presenting it
    // without that concession would make it the same kind of claim it replaced.
    expect(COST_COMPARISON.themNote).toMatch(/lower than ours|better/i);
  });

  it("makes no multiplier claim it can't do the arithmetic for", () => {
    // "one-hundredth the cost" was a shape, not a calculation, and it survived
    // three years because nothing checked it.
    expect(COST_COMPARISON.multiplier).not.toMatch(/hundredth|tenth|times/i);
  });

  it("has a complete incumbent comparison table", () => {
    expect(INCUMBENT_COMPARISON.length).toBeGreaterThanOrEqual(4);
    for (const row of INCUMBENT_COMPARISON) {
      expect(row.feature.length).toBeGreaterThan(0);
      expect(row.them.length).toBeGreaterThan(0);
      expect(row.us.length).toBeGreaterThan(0);
    }
  });

  it("describes the scan → tap → reconcile selling loop", () => {
    expect(SELLING_FLOW.length).toBe(3);
    for (const step of SELLING_FLOW) {
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.detail.length).toBeGreaterThan(0);
      expect(step.timeOfDay.length).toBeGreaterThan(0);
    }
  });

  it("exposes the AI-native inventory + tap-to-pay features", () => {
    const ids = FEATURES.map((f) => f.id);
    expect(ids).toContain("tap-to-pay");
    expect(ids).toContain("notebook-inventory");
    expect(ids).toContain("day-end-reconciliation");
  });

  it("lists European hosting as a feature agents can enumerate", () => {
    const hosting = FEATURES.find((f) => f.id === "eu-hosting");
    expect(hosting).toBeTruthy();
    // FEATURES feeds llms.txt, the MCP list_features tool and the landing
    // noscript, so the residency answer has to be in the same words there.
    expect(hosting?.description).toContain(DATA_RESIDENCY.provider);
    expect(hosting?.description).toContain(DATA_RESIDENCY.primaryCountry);
  });
});

describe("DATA_RESIDENCY", () => {
  it("names the provider, the region and the usual country", () => {
    expect(DATA_RESIDENCY.provider).toBe("Hetzner");
    expect(DATA_RESIDENCY.region).toBe("Europe");
    expect(DATA_RESIDENCY.primaryCountry).toBe("Germany");
    // The body is the paragraph every surface reuses — it has to carry all
    // three facts on its own, since the FAQ and llms briefs quote it whole.
    for (const fact of [
      DATA_RESIDENCY.provider,
      DATA_RESIDENCY.region,
      DATA_RESIDENCY.primaryCountry,
    ]) {
      expect(DATA_RESIDENCY.body).toContain(fact);
    }
  });

  it("keeps the sub-processor caveat attached to the claim", () => {
    // The one thing that must never be quietly dropped: hosting in Europe is
    // not the same as nothing ever leaving Europe. Stripe, the model provider
    // and the email service are third parties, and saying so is what makes the
    // rest of the claim worth believing.
    expect(DATA_RESIDENCY.caveat).toMatch(/stripe/i);
    expect(DATA_RESIDENCY.caveat).toMatch(/model provider|ai/i);
    expect(DATA_RESIDENCY.caveat).toMatch(/email/i);
  });

  it("claims a location, not a certification", () => {
    const copy = [
      DATA_RESIDENCY.headline,
      DATA_RESIDENCY.headlineEmphasis,
      DATA_RESIDENCY.body,
      ...DATA_RESIDENCY.points,
    ].join(" ");
    // "GDPR compliant" / "ISO certified" are claims we cannot substantiate in
    // marketing copy; which laws apply is a fact, and that's what we state.
    expect(copy).not.toMatch(/gdpr[- ]compliant|fully compliant|certified/i);
    expect(copy).toMatch(/GDPR/);
  });

  it("points at a page that actually exists", () => {
    expect(DATA_RESIDENCY.href).toBe("/legal/privacy");
  });

  it("answers residency in the FAQ, under its own category", () => {
    expect(FAQ_CATEGORIES).toContain("Privacy & data");
    const privacy = faqsByCategory("Privacy & data");
    expect(privacy.length).toBeGreaterThanOrEqual(3);
    const answers = privacy.map((f) => f.a).join(" ");
    expect(answers).toContain(DATA_RESIDENCY.provider);
    expect(answers).toContain(DATA_RESIDENCY.primaryCountry);
    // Including the awkward question, asked plainly.
    expect(privacy.some((f) => /leave Europe/i.test(f.q))).toBe(true);
  });

  it("is the hosting detail behind the wider Swissness claim", () => {
    // DATA_RESIDENCY answers "where are the servers"; SOVEREIGNTY answers
    // "where is the company and everything else". The servers row of the
    // ledger must be built from this constant, not typed in beside it.
    const servers = SOVEREIGNTY.ledger.find((e) => /database/i.test(e.piece));
    expect(servers?.today).toContain(DATA_RESIDENCY.provider);
    expect(servers?.today).toContain(DATA_RESIDENCY.primaryCountry);
    // And there is exactly one sub-processor caveat between them.
    expect(SOVEREIGNTY.caveat).toBe(DATA_RESIDENCY.caveat);
  });

  it("has a comparison row for where the data sits", () => {
    const row = INCUMBENT_COMPARISON.find(
      (r) => r.feature === "Where your data lives",
    );
    expect(row).toBeTruthy();
    expect(row?.us).toContain(DATA_RESIDENCY.provider);
    // We say where ours is; we don't assert a region for anyone else's.
    expect(row?.them).not.toMatch(
      /\b(United States|USA|US servers|Ireland|Germany)\b/,
    );
  });
});

describe("monthlyCostAt", () => {
  it("charges nothing on either plan's fee when there are no online sales", () => {
    const cost = monthlyCostAt(0);
    expect(cost.freePlanChf).toBe(0);
    expect(cost.cheaper).toBe("free");
  });

  it("applies the Free plan's percentage to online sales", () => {
    // 1% of 1,000 = 10
    expect(monthlyCostAt(1000).freePlanChf).toBe(10);
  });

  it("keeps Pro flat — the subscription price, with no fee on top", () => {
    expect(monthlyCostAt(0).proPlanChf).toBe(PRO_PLAN.priceChf);
    expect(monthlyCostAt(50_000).proPlanChf).toBe(PRO_PLAN.priceChf);
  });

  it("puts the crossover exactly at the advertised break-even", () => {
    const at = monthlyCostAt(PRO_BREAK_EVEN_ONLINE_CHF);
    expect(at.cheaper).toBe("tie");
    expect(at.freePlanChf).toBe(at.proPlanChf);

    expect(monthlyCostAt(PRO_BREAK_EVEN_ONLINE_CHF - 100).cheaper).toBe("free");
    expect(monthlyCostAt(PRO_BREAK_EVEN_ONLINE_CHF + 100).cheaper).toBe("pro");
  });

  it("reports the saving as the gap between the two plans", () => {
    const cost = monthlyCostAt(5000);
    expect(cost.savingChf).toBe(
      Math.round(Math.abs(cost.freePlanChf - cost.proPlanChf) * 100) / 100,
    );
  });

  it("rounds to whole cents rather than leaking float noise", () => {
    // 1% of 33.33 is 0.3333 — must not surface as 0.33329999999999996.
    expect(monthlyCostAt(33.33).freePlanChf).toBe(0.33);
  });

  it("treats negative and non-finite input as a zero month", () => {
    expect(monthlyCostAt(-500).onlineSalesChf).toBe(0);
    expect(monthlyCostAt(-500).freePlanChf).toBe(0);
    expect(monthlyCostAt(Number.NaN).freePlanChf).toBe(0);
  });
});

describe("ZERO_COST_POS", () => {
  it("is anchored to a plan that is genuinely free", () => {
    // The entire band collapses if this stops being true, so fail loudly here
    // rather than let the marketing page keep advertising CHF 0.
    expect(FREE_PLAN.priceChf).toBe(0);
  });

  it("promises only things the Free plan actually includes", () => {
    const free = FREE_PLAN.features.join(" ").toLowerCase();
    // Each claim maps to a Free-plan capability, matched on its load-bearing
    // term so wording can be edited without silently breaking the link.
    const mustAppearInFreePlan = ["pos", "inventory sync", "online store"];
    for (const term of mustAppearInFreePlan) {
      expect(free).toContain(term);
    }
    expect(ZERO_COST_POS.includes.length).toBeGreaterThanOrEqual(3);
  });

  it("does not claim analytics, which is a Pro feature", () => {
    // "Advanced analytics & AI insights" sits on Pro. Advertising it as part
    // of the free tier would be the one kind of error this band can't survive.
    const claimed = [
      ZERO_COST_POS.headline,
      ZERO_COST_POS.headlineEmphasis,
      ZERO_COST_POS.body,
      ZERO_COST_POS.catch,
      ...ZERO_COST_POS.includes,
    ]
      .join(" ")
      .toLowerCase();
    expect(claimed).not.toContain("analytic");
    expect(claimed).not.toContain("insight");
  });

  it("makes no claim about any competitor", () => {
    const claimed = [
      ZERO_COST_POS.headline,
      ZERO_COST_POS.headlineEmphasis,
      ZERO_COST_POS.body,
      ZERO_COST_POS.catch,
      ...ZERO_COST_POS.includes,
    ].join(" ");
    for (const c of COMPETITORS) {
      expect(claimed).not.toContain(c.name);
    }
  });
});

describe("AI_NATIVE_PITCH", () => {
  it("promises only the agent surface the Free plan actually ships", () => {
    // The hero's whole thesis rests on the Free plan's "Found by AI agents"
    // line — if that ever leaves the free tier, this pitch becomes a paywall
    // claim and must be rewritten, not silently kept.
    const free = FREE_PLAN.features.join(" ").toLowerCase();
    for (const term of ["llms.txt", "mcp"]) {
      expect(free).toContain(term);
    }
  });

  it("walks the found → asked → bought loop in order", () => {
    expect(AI_NATIVE_PITCH.steps.map((s) => s.k)).toEqual([
      "Found",
      "Asked",
      "Bought",
    ]);
    // Each step names the mechanism it rides on, so the band can't drift
    // into vague AI-washing: the brief, the protocol, the payout.
    const [found, asked, bought] = AI_NATIVE_PITCH.steps;
    expect(found.body).toContain("llms.txt");
    expect(asked.title + asked.body).toContain("MCP");
    expect(bought.body.toLowerCase()).toContain("stripe");
  });

  it("charges what the plan charges — 1% on agent orders, nothing else", () => {
    // The footnote quotes the fee; keep it pinned to REVENUE_SHARE so a
    // repriced skim can't leave the hero advertising the old number.
    expect(AI_NATIVE_PITCH.footnote).toContain(REVENUE_SHARE.percentLabel);
  });

  it("makes no comparative claim about any competitor in the positioning copy", () => {
    // Scoped to the thesis surfaces (headline, body, chart), where a
    // competitor's name could only be a comparison. The proof/steps copy is
    // allowed to name Stripe — there it's the payout rail Zolto really uses
    // (FEATURES "Direct payments with Stripe"), not a rival being knocked.
    const claimed = [
      AI_NATIVE_PITCH.eyebrow,
      AI_NATIVE_PITCH.headline,
      AI_NATIVE_PITCH.headlineEmphasis,
      AI_NATIVE_PITCH.body,
      AI_NATIVE_PITCH.chart.caption,
    ].join(" ");
    for (const c of COMPETITORS) {
      expect(claimed).not.toContain(c.name);
    }
  });

  it("keeps the discovery chart schematic — labels, not numbers", () => {
    // A figure here would be an invented market statistic; the chart is a
    // claim about direction only (see the AI_NATIVE_PITCH doc comment).
    expect(AI_NATIVE_PITCH.chart.decliningLabel).toBeTruthy();
    expect(AI_NATIVE_PITCH.chart.risingLabel).toBeTruthy();
    expect(AI_NATIVE_PITCH.chart.caption).not.toMatch(/\d+\s?%/);
  });
});

describe("INCUMBENT_COMPARISON headline row", () => {
  it("leads with the squeeze play, not with hardware or with price", () => {
    // It used to lead with "your catalogue on your phone" over a "card reader,
    // sold to you, CHF 50–300+" row. Both were retired: every competitor in
    // this market now runs softPOS on an ordinary phone, and SumUp's catalogue
    // isn't behind a paywall. What's left is the capability squeeze.
    expect(INCUMBENT_COMPARISON[0].feature).toMatch(/TWINT/i);
    expect(INCUMBENT_COMPARISON[0].feature).toMatch(/catalogue|till/i);
  });

  it("keeps the retired hardware claim out of the table", () => {
    const text = INCUMBENT_COMPARISON.map(
      (r) => `${r.feature} ${r.them} ${r.us}`,
    ).join(" ");
    expect(text).not.toMatch(/card reader/i);
    expect(text).not.toMatch(/CHF 50–300|CHF 50-300/);
  });

  it("admits in the table itself that their card rate is often lower", () => {
    // The row a comparison table would normally never carry. It's here because
    // a table that only lists rows we win is discounted on sight — and because
    // it's the finding the whole pricing review turned on.
    const costRow = INCUMBENT_COMPARISON.find((r) =>
      /what a sale costs/i.test(r.feature),
    );
    expect(costRow).toBeTruthy();
    expect(costRow!.them).toMatch(/lower than ours/i);
  });

  it("states our own side as a stack, not as a single percentage", () => {
    const costRow = INCUMBENT_COMPARISON.find((r) =>
      /what a sale costs/i.test(r.feature),
    )!;
    // "1% online" alone was the claim that read as the cost of a sale.
    expect(costRow.us).toMatch(/processor/i);
  });
});

describe("COMPETITORS", () => {
  it("covers the platforms makers actually weigh Zolto against", () => {
    const ids = COMPETITORS.map((c) => c.id);
    expect(ids).toContain("stripe");
    expect(ids).toContain("sumup");
    expect(ids).toContain("shopify");
    expect(ids).toContain("worldline");
  });

  it("sources and dates every competitor figure it quotes", () => {
    // This replaces an older rule that quoted no competitor pricing at all.
    // That rule was right about the failure mode — an undated figure rots —
    // and wrong about the remedy: it left the page unable to say the most
    // useful thing a buyer needs, while our own unsourced "year with the old
    // guard" number sat on the landing page unchallenged.
    //
    // The remedy is provenance, not silence. Any competitor entry carrying a
    // figure must name its sources, and every source must resolve and be dated.
    for (const c of COMPETITORS) {
      const text = [c.summary, ...c.betterWhen, ...c.zoltoWhen].join(" ");
      const quotesAFigure = /CHF\s?\d|\$\s?\d|€\s?\d|\d+(\.\d+)?\s*%/.test(
        text,
      );
      if (!quotesAFigure) continue;
      expect(
        c.sourceIds?.length,
        `${c.id} quotes a figure but names no source`,
      ).toBeGreaterThan(0);
      for (const id of c.sourceIds!) {
        expect(() => source(id)).not.toThrow();
        expect(source(id).retrievedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  it("resolves every rate id a competitor points at", () => {
    for (const c of COMPETITORS) {
      for (const id of c.rateIds ?? []) {
        expect(() => rate(id)).not.toThrow();
        // A competitor may only claim its own rates.
        expect(rate(id).provider).toBe(c.id);
      }
    }
  });

  it("concedes something real for every competitor", () => {
    // A comparison that never concedes reads as marketing and gets discounted.
    for (const c of COMPETITORS) {
      expect(c.betterWhen.length).toBeGreaterThanOrEqual(2);
      expect(c.zoltoWhen.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("concedes the two things the review says we must stop pretending away", () => {
    // Both are the strongest true statement a competitor can make, and a
    // comparison that omits them is discounted by readers and AI assistants
    // alike. Pinned so they can't be quietly softened later.
    const sumup = findCompetitor("sumup")!;
    expect(sumup.betterWhen.join(" ")).toMatch(/cheaper and simpler on cards/i);
    expect(sumup.betterWhen.join(" ")).toMatch(/track record/i);

    const worldline = findCompetitor("worldline")!;
    expect(worldline.betterWhen.join(" ")).toMatch(/PostFinance Pay/);
    expect(worldline.betterWhen.join(" ")).toMatch(
      /1\.7% flat|no fixed monthly/i,
    );
  });
});

describe("the fee stack is disclosed, not implied", () => {
  it("says in the pledge that our fee is not the cost of a sale", () => {
    // The single most consequential correction from the August 2026 review.
    // "0% in person / 1% online" is a platform fee charged ON TOP of the
    // payment processor's own rate; every surface quoted it as though it were
    // the total, and a reader found out otherwise from their Stripe statement.
    const points = PRICING_PROMISE.points.join(" ").toLowerCase();
    expect(points).toContain("not what a sale costs");
    expect(points).toMatch(/goes to them, not to us/);
  });

  it("says out loud that we are not the cheapest on card rate", () => {
    // Sold as "cheapest", the case doesn't survive the arithmetic. Conceding
    // it is what makes the rest of the pledge worth reading.
    expect(PRICING_PROMISE.points.join(" ")).toMatch(
      /not the cheapest way to get paid/i,
    );
  });

  it("names the other bill in the free-POS band too", () => {
    // ZERO_COST_POS makes the boldest free claim on the site, so it's the
    // cheapest place to stop "CHF 0.00" being read as the cost of acceptance.
    expect(ZERO_COST_POS.catch).toMatch(/their own rate/i);
  });

  it("keeps the platform summary free of the two retired claims", () => {
    // Both fed /llms.txt and the MCP tools, so an AI assistant was repeating
    // them to prospective merchants verbatim.
    expect(PLATFORM.summary).not.toMatch(/fraction of what/i);
    expect(PLATFORM.summary).not.toMatch(/find, recommend, and buy/i);
    expect(PLATFORM.summary).toMatch(/start a checkout/i);
    expect(PLATFORM.summary).toMatch(/apply on top and go to them/i);
  });

  it("states the stack in the payments feature, which agents enumerate", () => {
    const payments = FEATURES.find((f) => f.id === "payments")!;
    expect(payments.description).toMatch(/goes to Stripe/i);
    expect(payments.description).toMatch(/separate and on top/i);
  });
});

describe("the two TWINT rails are told apart", () => {
  const ledgerText = () =>
    SOVEREIGNTY.ledger.map((e) => `${e.piece} ${e.today}`).join(" ");

  it("gives the QR path and the in-app button their own rows", () => {
    // server/pos.ts has two TWINT paths and the ledger described only the
    // flattering one. `twint_qr` is the merchant's own sticker — Swiss end to
    // end at 1.3%, money we never see. The in-app button is a Stripe
    // PaymentIntent, so it runs on Stripe's rails at a rate Stripe doesn't
    // publish. One row claiming "Swiss, end to end" covered both.
    const qr = SOVEREIGNTY.ledger.find((e) => /own QR/i.test(e.piece));
    const button = SOVEREIGNTY.ledger.find((e) => /the button/i.test(e.piece));
    expect(qr?.state).toBe("swiss");
    expect(button?.state).toBe("moving");
    expect(button?.next).toBeTruthy();
  });

  it("does not describe the Stripe-routed button as Swiss end to end", () => {
    const button = SOVEREIGNTY.ledger.find((e) => /the button/i.test(e.piece))!;
    expect(button.today).toMatch(/Stripe/);
    expect(button.today).not.toMatch(/end to end/i);
  });

  it("still names the QR rate, since it is genuinely the cheapest", () => {
    expect(ledgerText()).toMatch(/1\.3%/);
  });
});

describe("the agent-commerce claim matches what create_checkout does", () => {
  it("says the assistant opens a checkout rather than completing a purchase", () => {
    // MCP's create_checkout returns a Stripe payment link a human completes.
    // "It checks out in the chat" and "watch an AI buy" both overstated it.
    const bought = AI_NATIVE_PITCH.steps[2];
    expect(bought.title).toMatch(/opens the checkout|your customer pays/i);
    expect(`${bought.title} ${bought.body}`).toMatch(/customer (taps )?pays/i);
  });

  it("scopes the proof band to rails-live rather than traffic-live", () => {
    // find_stores returns an empty list until storefronts launch. The rails
    // being real and the channel being populated are different claims.
    expect(AI_NATIVE_PITCH.proof.eyebrow).not.toMatch(/live today/i);
    expect(AI_NATIVE_PITCH.proof.headline).not.toMatch(/\bbuy\b/i);
  });

  it("says the discovery directory is still filling up", () => {
    const discovery = FEATURES.find((f) => f.id === "ai-discovery")!;
    expect(discovery.description).toMatch(/fills up|ahead of the traffic/i);
  });
});

describe("the capability matrix", () => {
  it("makes Zolto answer every question it asks of anyone else", () => {
    for (const c of CAPABILITIES) {
      expect(c.label).toBeTruthy();
      expect(c.zolto).toBeTruthy();
    }
  });

  it("includes at least one row Zolto loses", () => {
    // A matrix that only asks questions we win is a scorecard we wrote for
    // ourselves. PostFinance Pay is the honest "no".
    expect(CAPABILITIES.some((c) => c.zoltoSupported === false)).toBe(true);
    expect(capability("postfinance").zoltoSupported).toBe(false);
  });

  it("answers every row for every competitor that publishes a matrix", () => {
    // A silently missing row renders as a blank cell, which a reader fills in
    // themselves — usually in our favour. Partial columns are not allowed.
    const keys = CAPABILITIES.map((c) => c.key).sort();
    for (const c of COMPETITORS) {
      if (!c.capabilities) continue;
      expect(c.capabilities.map((x) => x.key).sort(), `${c.id}`).toEqual(keys);
      for (const answer of c.capabilities) {
        expect(() => capability(answer.key)).not.toThrow();
        expect(answer.value).toBeTruthy();
      }
    }
  });

  it("records the squeeze play as data rather than as a slogan", () => {
    // The one in-person argument the review says survives contact: SumUp has
    // the grid but not TWINT; Worldline has TWINT but not the grid.
    const answer = (id: string, key: string) =>
      findCompetitor(id)!.capabilities!.find((c) => c.key === key)!;
    expect(answer("sumup", "item-grid").supported).toBe(true);
    expect(answer("sumup", "twint").supported).toBe(false);
    expect(answer("worldline", "twint").supported).toBe(true);
    expect(answer("worldline", "item-grid").supported).toBe(false);
    expect(capability("item-grid").zoltoSupported).toBe(true);
    expect(capability("twint").zoltoSupported).toBe(true);
  });

  it("throws on an unknown capability key", () => {
    expect(() => capability("nope")).toThrow(/Unknown capability key/);
  });
});

describe("Worldline's disclosed risks", () => {
  it("sources every statement to a primary record", () => {
    const worldline = findCompetitor("worldline")!;
    expect(worldline.risks?.length).toBeGreaterThan(0);
    for (const r of worldline.risks!) {
      expect(r.statement).toBeTruthy();
      expect(() => source(r.sourceId)).not.toThrow();
    }
  });

  it("stays on the record and off the attack", () => {
    // Deliberately limited to the credit rating and SIX's own disclosure.
    // The fraud reporting and the market-cap collapse are omitted: they read
    // as attack rather than analysis, and this page's credibility rests on
    // conceding fairly. If either ever appears here, this test says so.
    const text = findCompetitor("worldline")!
      .risks!.map((r) => r.statement)
      .join(" ");
    expect(text).toMatch(/S&P|BB/);
    expect(text).toMatch(/SIX/);
    expect(text).not.toMatch(/money.?launder|fraud|criminal|probe/i);
    expect(text).not.toMatch(/97%|market value/i);
  });

  it("is only carried where 'the incumbent is safe' is the argument", () => {
    // Not a general licence to publish company gossip about competitors.
    for (const c of COMPETITORS) {
      if (c.id === "worldline") continue;
      expect(c.risks, `${c.id} should not carry risks`).toBeUndefined();
    }
  });
});

describe("SOVEREIGNTY", () => {
  it("claims Switzerland for the company and states who it serves, in order", () => {
    expect(SOVEREIGNTY.headline).toMatch(/Made in Switzerland/i);
    // Swiss first, Europe next, then everyone — the order is the claim.
    const serving = SOVEREIGNTY.serving;
    expect(serving).toMatch(/Z(ü|u)rich/);
    expect(serving.indexOf("Swiss")).toBeLessThan(serving.indexOf("Europe"));
    expect(serving).toMatch(/anyone|everyone|rest of the world/i);
  });

  it("publishes a ledger that includes the unflattering rows", () => {
    // A ledger of only-finished rows is a badge. The whole reason this is a
    // structure and not a paragraph is that the pending and never-moving rows
    // ship alongside the done ones.
    expect(SOVEREIGNTY.ledger.length).toBeGreaterThanOrEqual(6);
    expect(sovereigntyByState("moving").length).toBeGreaterThan(0);
    expect(sovereigntyByState("foreign").length).toBeGreaterThan(0);
    expect(
      sovereigntyByState("swiss").length +
        sovereigntyByState("european").length,
    ).toBeGreaterThan(0);
  });

  it("gives every row a present-tense today, and every unfinished row a next", () => {
    for (const entry of SOVEREIGNTY.ledger) {
      expect(entry.piece.length).toBeGreaterThan(0);
      expect(entry.today.length).toBeGreaterThan(0);
      expect(SOVEREIGNTY_STATE_LABEL[entry.state]).toBeTruthy();
      // "moving" is a promise the page makes on our behalf: it has to say
      // where to, and "foreign" has to say why not. Only finished rows may
      // stay silent.
      if (entry.state === "moving" || entry.state === "foreign") {
        expect(entry.next, `${entry.piece} needs a next/why`).toBeTruthy();
      }
    }
  });

  it("does not describe an aspiration in the present tense", () => {
    // The failure mode this guards is a row whose `today` quietly claims the
    // destination — "Swiss payment processor" in today, with the move in next.
    for (const entry of sovereigntyByState("moving")) {
      expect(entry.today).not.toMatch(/^Swiss\b/i);
      expect(entry.today.toLowerCase()).not.toContain("switzerland");
    }
  });

  it("names the card networks as permanently foreign rather than omitting them", () => {
    const never = sovereigntyByState("foreign");
    const text = never.map((e) => `${e.piece} ${e.today} ${e.next}`).join(" ");
    expect(text).toMatch(/visa|mastercard/i);
    expect(text).toMatch(/apple pay|google pay/i);
    // …and points at the rail that IS Swiss end to end.
    expect(text).toMatch(/TWINT/);
  });

  it("says why, in terms of the customer rather than the flag", () => {
    expect(SOVEREIGNTY.why.length).toBeGreaterThanOrEqual(3);
    const why = SOVEREIGNTY.why.join(" ");
    expect(why).toMatch(/customers?/i);
    expect(why).toMatch(/GDPR|FADP/);
  });

  it("commits to keeping the ledger honest as rows land", () => {
    expect(SOVEREIGNTY.promise.length).toBeGreaterThan(0);
    expect(SOVEREIGNTY.promise).toMatch(/complete list|whole list/i);
  });

  it("points at a route the app actually serves", () => {
    expect(SOVEREIGNTY.href).toBe("/made-in-switzerland");
  });

  it("carries a compact hero form of the same facts", () => {
    expect(SOVEREIGNTY.heroBadges.length).toBe(3);
    const badges = SOVEREIGNTY.heroBadges.join(" ");
    expect(badges).toMatch(/Made in Switzerland/);
    expect(badges).toContain(DATA_RESIDENCY.region);
    expect(badges).toMatch(/TWINT/);
  });

  it("answers the Swissness questions in the FAQ too", () => {
    const questions = FAQS.map((f) => f.q).join(" | ");
    expect(questions).toMatch(/Is Zolto Swiss/i);
    expect(questions).toMatch(/moving the rest of the stack to Europe/i);
    // Both answers must point at the ledger rather than re-asserting a vibe.
    const answers = FAQS.filter((f) => /swiss|europe/i.test(f.q))
      .map((f) => f.a)
      .join(" ");
    expect(answers).toContain(SOVEREIGNTY.href);
  });
});
