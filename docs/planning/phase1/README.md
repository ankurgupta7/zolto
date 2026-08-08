# Phase 1 Implementation Kit

> Content Engine & Launch Partner (Months 1–2)

This folder contains everything needed to execute Phase 1 of the Zolto business plan. All content is ready to review, edit, and deploy.

---

## What's Ready (🤖 AI Generated)

### 1. Master Tracker
📄 `tracker.md`
- Day-by-day task list with owners (AI vs You)
- Success criteria checklist
- Risk mitigation table
- Daily standup template

### 2. Content (Blog Posts)
📄 `content/launch-diary-1.md` — "The Setup" (configuring the store)
📄 `content/launch-diary-2.md` — "Going Live" (first day + first order)
📄 `content/launch-diary-3.md` — "First Month" (honest metrics)
📄 `content/photo-guide.md` — Product photography guide for Kalakosh

### 3. Legal Pages
📄 `legal/privacy-policy.md` — GDPR-compliant privacy policy
📄 `legal/terms-of-service.md` — Subscription terms, AI liability, dispute resolution
📄 `legal/content-release-form.md` — Kalakosh content partnership agreement

### 4. Marketing
📄 `marketing/pricing-page-copy.md` — Pricing page content + A/B test plan
📄 `marketing/seo-keywords.md` — Target keywords + content calendar + schema markup

### 5. Code
📄 `code/phase1-code-changes.md` — Minimal code changes for Phase 1:
- Iteration log table
- Feature usage tracking
- AI chatbot conversation log
- `tenant_id` migration (backward-compatible)
- Self-serve signup + onboarding
- Chatbot metrics dashboard

---

## What You Need to Do (👤 Your Action Items)

### Immediate (This Week)
1. [ ] Review all content drafts — edit for your voice, add real details
2. [ ] Share content release form with Kalakosh → get signed
3. [ ] Set up product photography (use `photo-guide.md`)
4. [ ] Upload Kalakosh products to online store
5. [ ] Configure POS ↔ online sync
6. [ ] Deploy code changes from `phase1-code-changes.md`

### After Store Launch
7. [ ] Run 7-day AI chatbot conversation audit
8. [ ] Publish Launch Diary #1 (add your photos)
9. [ ] Set up Google Analytics + Search Console
10. [ ] Publish pricing page with A/B test
11. [ ] Publish legal pages

---

## Quick Start

1. Open `tracker.md` — this is your daily guide
2. Read `content/launch-diary-1.md` — this will be your first published piece
3. Review `legal/content-release-form.md` — get Kalakosh to sign it
4. Check `code/phase1-code-changes.md` — implement database changes first

---

## File Count

| Category | Files | Size |
|----------|-------|------|
| Tracker | 1 | ~9 KB |
| Content | 4 | ~18 KB |
| Legal | 3 | ~14 KB |
| Marketing | 2 | ~8 KB |
| Code | 1 | ~11 KB |
| **Total** | **11** | **~60 KB** |

---

> **"Don't worry. Even if the world forgets, I'll remember for you."**
>
> Everything is in this folder. Start with `tracker.md`. 🖤

## Instagram short (added 2026-08-06)

[`marketing/instagram-short-brief.md`](./marketing/instagram-short-brief.md) is
the shareable brief for an outside creator: the pitch in three lengths, a
45-second live-action shot list, caption and camera direction, and — most
importantly — the list of claims we may **not** make.

The format is a real person walking the Zürich lakeside promenade, showing the
product on her own laptop and phone, in the **third person** — she is not the
maker. That distance is deliberate: it lets beat 6 concede that Zolto is not
the cheapest way to take a card, which a founder saying it to camera could not
pull off, and which is the most persuasive five seconds in the video.

Hand it over whole; §5 exists because a copywriter's instinct is to reach for
"cheapest", and on card rate we are the most expensive option on our own
comparison table.

[`marketing/instagram-short-ai-prompts.md`](./marketing/instagram-short-ai-prompts.md)
is the same 45 seconds as generation prompts for a text-to-video model
(Veo-3-class), for the case where we produce it ourselves rather than casting a
creator. It is a companion, not a replacement — the brief still holds the pitch
and §5.

Read its §1 before budgeting for that route: current models cannot render a
legible interface, and three of the seven beats are screen beats, so the only
workable shape is an AI-generated person and location with the real product
screens composited in post. §7 records the other cost: a synthetic presenter
can describe the product but cannot be a testimonial.
