# Kalakosh Zurich — Project TODO

## Database & Backend

- [x] Products table (id, name, description, price, category, imageKey, imageUrl, visible, createdAt)
- [x] Drizzle schema migration applied
- [x] tRPC: products.list (public, visible only)
- [x] tRPC: products.getById (public)
- [x] tRPC: products.adminList (admin, all products)
- [x] tRPC: products.toggleVisibility (admin)
- [x] tRPC: products.delete (admin)
- [x] File upload endpoint for product images (via S3 storagePut)
- [x] Slack Events API POST /api/slack/events (verify + receive)
- [x] LLM parser: extract name, description, price, category from Slack message text
- [x] Slack image download and upload to S3
- [x] Owner notification on successful product add via Slack

## Frontend — Global

- [x] Global CSS: deep green/gold palette (Kalakosh branding), Cormorant Garamond + Inter
- [x] Top navigation: Home, Shop, About, Contact (+ admin link when logged in as admin)
- [x] Footer with brand name and minimal links
- [x] Responsive layout (mobile-first)

## Frontend — Pages

- [x] Home page: hero section, brand tagline, featured categories, CTA to Shop
- [x] Shop page: product grid with category filter (All, Silver, Semi-Precious Gems, Pearls)
- [x] Product Detail modal/page: enlarged image, name, description, price, category badge
- [x] About page: brand story, values, materials sections
- [x] Contact page: enquiry form (name, email, subject, message) with submission feedback

## Admin Interface

- [x] Admin-only nav item visible only to logged-in admin
- [x] Admin panel: list all products (including hidden)
- [x] Toggle product visibility (show/hide)
- [x] Delete product permanently
- [x] Admin controls hidden from regular visitors

## WhatsApp Integration

- [x] Slack URL verification challenge (url_verification type)
- [x] Incoming message handler (POST /api/slack/events)
- [x] Parse image + text from Slack message payload
- [x] Download Slack file using Bot Token
- [x] LLM extraction of product fields from free-form text
- [x] Auto-create product in DB with uploaded image
- [x] Owner notification on product creation

## Bug Fixes

- [x] Fix duplicate product creation when Discord fires MESSAGE_CREATE twice (added discordMessageId dedup column)
- [x] Add quick-access hide/delete buttons on product cards in Shop for admin users

## Tests

- [x] Vitest: LLM parser unit test
- [x] Vitest: products tRPC procedures
- [x] Vitest: Slack webhook handler

## New Features (Round 2)

- [x] Add `sold` status to products schema (boolean column)
- [x] DB migration for sold column
- [x] tRPC: products.toggleSold (admin)
- [x] Admin toggle to mark product as sold/available (ShoppingBag icon button on hover)
- [x] "Sold" badge on product cards and detail modal
- [x] Sold items remain visible in catalogue with badge overlay
- [x] Floating WhatsApp enquiry button (+41 791948146) on all pages
- [x] WhatsApp button pre-fills message with product name when clicked from product detail
- [x] Instagram link in footer and contact page
- [x] Instagram CTA in WhatsApp pre-filled message

## Design Refresh (Round 3)

- [x] Bigger logo in navbar (h-16/h-20, navbar height h-20/h-24)
- [x] Abstract SVG/CSS art background in hero section (geometric mandala + botanical branch + diamond cluster + stars)
- [x] product_images table: productId, imageKey, imageUrl, sortOrder
- [x] DB migration for product_images table
- [x] tRPC: products.addImage, deleteImage (admin)
- [x] tRPC: products.getImages (public)
- [x] Product modal image carousel with swipe/arrows (Embla carousel, dot indicators, image counter, thumbnail strip)
- [x] Admin panel: multi-image upload per product (ProductImageManager component)
- [x] Instagram icon in Navbar (desktop + mobile)
- [x] Instagram CTA button in hero (replaces 'Our Story')
- [x] Instagram profile card section on Home page
- [x] Instagram follow banner in Footer
- [x] Instagram gradient card on Contact page

## Marketing, Messaging & Positioning (Round 4)

### Marketing blurb

> **Zolto exists to disrupt the website + point-of-sale integration market.** The big incumbents — Stripe, Worldline, SumUp — are relics of a previous era of software, when building a website was hard and keeping a small database of inventory was expensive. They overcharge small merchants for what is now cheap, and their real game is upselling their own card-reader hardware to lock you inside their ecosystem.
>
> Two things have fundamentally changed. **First, AI** — we can now build a merchant's website in under a day. **Second, phones carry NFC chips** and QR-based payment methods (TWINT and friends) are everywhere, so nobody pushes a card into a machine anymore — they tap, and a phone is all the hardware you need. Server space is dirt cheap. There is simply no reason for a small business to pay hundreds or thousands of euros a year — in France, easily €2,000 — to stay trapped in a legacy provider.
>
> **We don't do any of that.** Our pricing is radically transparent: we never charge for anything that isn't charged to us. We have enough money of our own — we are not here to make money off small people. We are here to help them, and we promise to always keep doing that. Instead of €2,000, you spend €20 — one-hundredth the cost. Why wouldn't you?
>
> And the biggest shift of all: **AI means inventory management no longer has to be rigid.** AI handles ambiguity by design, so we let merchants stay messy. Kept your stock in a notebook or a diary? Scan it — we pick it up automatically. Too busy at your stall to tag every sale? Just punch the amount into the reader (say, 50 francs) and make the sale — at the end of the day our AI figures out what you most likely sold and emails you a simple guess to confirm; once you tap the right item, it's marked sold everywhere at once — website, POS, catalogue. Don't know what to call a piece, can't write silky jewelry copy, don't speak every customer's language? That's fine — the AI names, describes, and translates for you from just a photo. We keep you free. We're on your side.

### Positioning pillars (every surface should reinforce these)

- [ ] **Pillar 1 — Disrupt the legacy website + POS market.** Frame Stripe / Worldline / SumUp as previous-era software that overcharges to keep small merchants locked in and to upsell card-reader hardware.
- [ ] **Pillar 2 — The two shifts that make legacy obsolete.** (a) AI builds a full store in under a day; (b) NFC phones + QR payments (TWINT) mean no card hardware and near-zero server cost.
- [ ] **Pillar 3 — Radically transparent, pass-through pricing.** Never charge for anything not charged to us; never monetize small merchants; ~1/100th the cost (€20 vs €2,000). A public, plain-language pricing promise.
- [ ] **Pillar 4 — AI-native inventory that embraces ambiguity** (flagship pillar). Scan handwritten notes/diaries → auto-imported. Value-only POS sales reconciled by an end-of-day AI email that marks the item sold everywhere on confirmation. AI does naming, silky descriptions, and multi-language translation from a photo.

### Marketing copy tasks

- [ ] Rewrite Home hero around the disruption thesis — headline + subhead lead with "one-hundredth the cost, no card reader to buy," CTA to see pricing / start a store
- [ ] "Why Zolto vs. Stripe/SumUp/Worldline" comparison section (cost, lock-in, hardware upsell, AI setup speed) on Home or a dedicated page
- [ ] Transparent-pricing page: pass-through promise, €20-vs-€2,000 framing, "we never charge for anything not charged to us," explicit "we will always be on the small merchant's side" pledge
- [ ] "Built in a day with AI" section — set-up-speed story for the merchant
- [ ] "Tap, don't insert" section — NFC phone + TWINT/QR payments, no hardware to buy
- [ ] AI-inventory story section: scan-your-notebook, value-only sales + end-of-day AI reconciliation email, AI naming/descriptions/translations from a photo
- [ ] Rewrite About page to carry the mission ("we have enough; we're here to help small merchants, not extract from them")
- [ ] Audit all copy so it's translated by AI (DE/EN and beyond) and never assumes the merchant writes multiple languages

### UI / design direction (gear the whole UI toward the pillars)

- [ ] Establish a design language that reads "modern, transparent, on-your-side" — open/airy layout, honest typography, no dark-pattern upsell UI
- [ ] Surface pricing prominently and legibly everywhere (nav + footer link, no hidden fees) as a trust signal, contrasting with incumbents' opaque pricing
- [ ] Design merchant onboarding to feel "up and running in a day" (progress that celebrates speed, minimal required fields)
- [ ] POS UI: make value-only "just enter the amount and sell" the fast default; defer item selection to AI reconciliation
- [ ] End-of-day AI reconciliation email + in-app review UI: one-tap confirm of the AI's guess, then sold-status propagates to store + POS + catalogue
- [ ] Bulk/"scan my notebook" import UI: upload a photo/scan of handwritten inventory → AI-extracted draft products to confirm
- [ ] Catalog editor with AI-assist affordances: generate name, generate silky description, auto-translate — all optional, all editable
- [ ] Comparison/"switch from your old provider" UI that quantifies savings vs. legacy players
