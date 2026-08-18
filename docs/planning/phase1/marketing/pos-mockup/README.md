# POS mockup — for the Instagram short only

> ## ⚠️ These are not the product.
>
> `pos-grid.png` and `pos-payment.png` are **hand-built HTML mockups** of the
> till. They are not screenshots of the Zolto POS. Nothing here is wired to
> anything — the totals are typed in, the tap states are CSS classes.
>
> **Do not use them as documentation, as a design spec, or as evidence that a
> screen looks or behaves a certain way.** The real till is the Android app
> under [`android/`](../../../../android). If you want to know what it actually
> looks like, run it.

## Why they exist

The Instagram short ([`../instagram-short-veo-prompts.txt`](../instagram-short-veo-prompts.txt))
needs three screen recordings — S1, S2, S3 — because AI video cannot render a
legible interface. The plan is to cut away to real footage of the real app.

Getting that real footage needs a phone with the app on it and a store with real
stock. Until someone records it, these stand in: they let the edit be assembled,
timed and reviewed without blocking on a device.

**They are placeholders. Replace them with real recordings before publishing.**

## What is faithful, and what isn't

Faithful, because it was copied from the source rather than eyeballed:

- **The palette** — lifted verbatim from
  [`android/app/src/main/res/values/colors.xml`](../../../../android/app/src/main/res/values/colors.xml).
  Oyster `#F7F3EE`, mahogany `#2D2620`, gold `#B8963E`, ivory `#EDE7DF`.
- **The layout** — two-column grid (`GridLayoutManager` uses `spanCount = 2`
  below 600dp), card with image over bold name over gold price, gold quantity
  badge top-right, all from
  [`item_product_card.xml`](../../../../android/app/src/main/res/layout/item_product_card.xml).
- **The strings** — "Verkauf prüfen", "Zahlungsart", "TWINT / Karte / Bar /
  TWINT QR", the search hint — all from `strings.xml`.
- **The product photography** — the real pilot-maker shots in
  [`../../assets/`](../../assets), referenced in place rather than duplicated.

Not faithful, and the reasons matter:

- **The TWINT icon is a neutral stand-in** — two overlapping circles. TWINT's
  actual mark is a trademark and is deliberately not reproduced. Swap in the
  licensed asset before anything is published.
- **"Atelier Perle" is invented.** Not a real store. Using a real merchant's
  name or logo needs a signed release — see
  [`../../legal/content-release-form.md`](../../legal/content-release-form.md).
- **Prices and stock counts are made up**, chosen to look plausible at a Zürich
  market.
- The status bar, the sync indicators, the offline banner and the category
  filtering are all decorative. Only what the video needs is drawn.

## Regenerating

```bash
node docs/planning/phase1/marketing/pos-mockup/shoot.mjs
```

Writes `pos-grid.png` and `pos-payment.png` at 1170×2532 (390×844 at 3×), which
drops into a 1080×1920 vertical timeline without upscaling. Edit `grid.html` or
`pay.html` and re-run.

The script serves `docs/planning/phase1` as its web root so the pages can point
at the real photography in `assets/`. It fails loudly if any image 404s, because
a mockup with broken images still screenshots successfully and looks merely
empty — which is exactly the failure that produced this folder's first draft.

## One typography note

Money uses `font-variant-numeric: lining-nums`. This is not decoration. The
brand serif defaults to oldstyle figures, which renders `CHF 340` as `CHF 34o`
— see the note in the root `CLAUDE.md`. Any money or stock figure added here
needs the `.num` class.
