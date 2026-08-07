# Zolto — the pitch, and a brief for a 30-second Instagram short

> **Shareable with an outside artist.** Everything here is either shipped or
> checkable. §5 is the part that matters most to a copywriter's instincts —
> please read it before writing a single line of on-screen text.
>
> Written 2026-08-06, from the positioning as it stands after the August
> pricing review ([`../../positioning-pricing-revision.md`](../../positioning-pricing-revision.md)).

---

## 1. The pitch, in three lengths

### One line

**You make things. Zolto does the rest.**

### One paragraph

Zolto is a shop, a till and a stock list that are all the same thing. Photograph
your handwritten inventory and it becomes a catalogue. At the market, tap the
photo of the actual object and take TWINT, card or cash on the same screen. The
same object is already on your website, written up in four languages, with one
stock count across both — so the vase that sells at the stall can't sell again
online ninety seconds later. It costs nothing a month to start.

### The full case

There are good ways to take a card in Switzerland. There is no good way to run
the *rest* of it — the photographs, the descriptions, the website, the stock
list, the reconciliation at the end of a market day. That work is the reason
most makers sell in person only, or sell online badly.

Zolto is the whole operation rather than the payment:

- **One till with your things in it.** Not a keypad — a grid of photographs of
  what you actually made. Tap the piece, then choose TWINT, card or cash.
- **A shop that builds itself.** AI drafts the theme, writes the listings in
  German, French, Italian and English, and turns one phone photo into a
  catalogue shot.
- **One stock count.** Stall and website, with a short hold while a customer is
  in checkout, so a one-off piece cannot sell twice.
- **Stock in without typing.** Photograph a notebook page, or send a photo and a
  price to WhatsApp.
- **Found and bought by AI.** Every shop publishes a brief and an endpoint that
  AI assistants can read, so a customer asking an assistant for a handmade piece
  can be shown yours and handed a checkout.
- **CHF 0/month to start**, nothing on in-person sales, 1% on online orders.

---

## 2. Who it's for

A Swiss maker — jewellery, ceramics, textiles — who sells at markets and fairs
and either has no website or has one she resents. She is not price-shopping
card terminals. She is tired of evenings spent on admin.

**Emotionally**: the pitch is *"stop doing the boring half"*, not *"save money"*.

---

## 3. The short — 30 seconds, 9:16

Assume **muted playback**. Every beat must land on the visual plus on-screen
text; treat voiceover as a bonus, not a carrier.

| # | Time | Visual | On-screen text |
|---|---|---|---|
| 1 | 0–3s | Close on hands finishing a piece — wire, clay, thread. Warm, real, shallow depth. | **You didn't start making things to do admin.** |
| 2 | 3–7s | Quick, cluttered cuts: a scribbled notebook, a spreadsheet, a shoebox of receipts, a laptop at 11pm. Slightly too fast, slightly stressful. | *the other half of the job* |
| 3 | 7–12s | Phone photographs the notebook page. Whip to the same phone: the scrawl has become a clean grid of products with photos and prices. | **Photograph your notebook. That's the setup.** |
| 4 | 12–18s | **The money shot.** Market stall, daylight. Her thumb taps a *photo of the actual object* on the grid. Payment row appears: TWINT, card, cash. Customer taps. Done. | **Your things in the till. TWINT, card or cash.** |
| 5 | 18–23s | Same object on a website on a laptop. The stock number ticks 4 → 3 on the phone *and* the laptop at the same moment. | **One shop. One stall. One stock count.** |
| 6 | 23–27s | A phone chat window: someone asks an assistant for a handmade gift in Zürich. Her piece appears. A checkout opens. | **Even the AI knows where to send them.** |
| 7 | 27–30s | Logo on the mahogany band. Gold underline stroke draws itself under the price. | **Zolto — CHF 0/month to start · zolto.ch** |

**If a 15-second cut is needed**, keep beats 1, 4, 7. Beat 4 is the product.

### Sound

No music track chosen yet. Direction: sparse, warm, acoustic — a workshop, not a
fintech. Diegetic sound (clay, a market, the payment chime) over a synth bed.

---

## 4. Visual direction

The brand exists already — please extend it rather than invent.

**Palette**

| Use | Hex |
|---|---|
| Page / light ground | `#F7F3EE` oyster cream |
| Dark band (hero, end card) | `#2D2620` warm mahogany |
| The one accent | `#B8963E` refined gold |
| Ink / body | `#1C1714` |

Gold is the *only* accent. Nothing else competes.

**Type**

- Headlines: **Cormorant Garamond**, weight 400 — serif, airy, generous line height.
- Handwritten accents only: **Caveat**, weight 500.
- ⚠️ Cormorant defaults to *oldstyle* numerals, which renders `CHF 0` as `CHF o`.
  Any money or stock figure must use lining figures.

**Motion and illustration**

The site uses hand-drawn single-weight line art — a market stall, a phone till,
a sketch underline that draws itself under a punchline. `SqueezePlayTill` in the
codebase draws three phones in that idiom and is the closest reference for beat 4.

Prefer **live footage for beats 1–2 and 4–5** (hands, market, real objects) and
**line-art overlay** for the UI moments. The product should feel like it lives
inside a craft world, not the other way round.

**Casting and location.** A real Swiss market, a real maker's hands. Not a
studio. Not stock footage of a generic café.

---

## 5. What we may not say — please read this one

The marketing was rewritten in August 2026 because several claims didn't survive
being checked. They are not coming back, and a short that reintroduces one costs
more than it earns.

**Never:**

- ❌ **"Cheapest", "lowest fees", "a fraction of the cost."** On card rate Zolto
  is the *most expensive* option on its own published comparison. This is the
  single most important line in this brief.
- ❌ **"No fees" / "0%"** on its own. In person Zolto takes nothing, but the
  payment processor always takes its own cut, and online is 1% on the Free plan.
  "CHF 0/month" is true and is the phrasing to use.
- ❌ **"Buy inside the chat."** An AI assistant can pick a piece and *open a
  checkout*; a human completes it. Beat 6's text is written accordingly.
- ❌ **"No card reader needed"** as a differentiator. Every competitor's phone
  does this now. It's true, it's just not interesting.
- ❌ Suggesting AI assistants are already sending customers to Zolto shops. The
  rails are live; the directory is still filling up. Beat 6 shows a capability,
  not a traffic claim.
- ❌ Naming or mocking a competitor. The comparison lives on the website where it
  can carry its sources.

**Safe to say, all shipped and checkable:**

- ✅ CHF 0/month to start, nothing on in-person sales
- ✅ Your catalogue and TWINT on the same screen
- ✅ Photograph a notebook page to load your stock
- ✅ One phone photo becomes a product shot (disclose AI-styled where shown)
- ✅ Listings in German, French, Italian and English
- ✅ One stock count across the stall and the shop
- ✅ Built in Zürich; your money goes to your own accounts

---

## 6. Practical

**Deliverables**
1. 30s master, 9:16, 1080×1920, burned-in text (muted-first)
2. 15s cut (beats 1, 4, 7)
3. A 1080×1080 still for the feed — beat 4 is the frame
4. Project file, so copy can be retimed without a reshoot

**Assets we can provide**: logo and wordmark, the full palette and fonts, the
line-art illustrations, and real product photography from the pilot maker
(`docs/planning/phase1/assets/`).

**Before any real maker or product appears**, a signed content release is
required — see `../legal/content-release-form.md`. This applies even to a
friendly pilot merchant.

**Open questions for the artist**
1. Live action, animated line art, or a hybrid? The brief assumes hybrid.
2. Do you shoot, or do we supply footage and you edit?
3. Whose hands and whose market — do you have a maker, or do we arrange one?
4. Budget and turnaround for the three deliverables above.
