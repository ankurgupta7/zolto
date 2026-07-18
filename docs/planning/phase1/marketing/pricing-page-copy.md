# Pricing Page Copy

> zolto.com/pricing

---

## Hero Section

### Headline
**Simple pricing for makers.**

### Subheadline
Start free. Upgrade when you're ready. No hidden fees, no surprises.

### CTA Button
[Start Free →]

---

## Plan Cards

### Free
**€0** / month

For makers exploring.

- Up to 50 products
- 1 staff member
- Basic POS
- No online store
- 10 AI descriptions/month
- Community support

[Get Started Free →]

---

### Maker
**€19** / month

For solo makers. *(Sheena at Kalakosh uses this.)*

- Unlimited products
- 1 staff member
- Full POS + Online store
- Unlimited AI descriptions
- Bulk upload
- Real-time inventory sync
- Standard analytics
- Email support

**Most Popular**

[Start 14-Day Free Trial →]

---

### Studio
**€49** / month

For small teams.

Everything in Maker, plus:
- 5 staff members
- Custom domain
- Real-time inventory sync
- Advanced analytics
- Priority support

[Start 14-Day Free Trial →]

---

### Atelier
**€99** / month

For growing brands.

Everything in Studio, plus:
- 20 staff members
- API access
- Custom AI training
- Dedicated support
- SLA guarantee

[Contact Sales →]

---

## Add-on: Photo & Bot Studio *(proposed — pricing not finalized)*

**€15–19** / month, add-on to any paid plan

AI photo restyling (turn one rough phone photo into a catalogue shot or a
full lifestyle image — disclosed as AI-generated) bundled with the
WhatsApp/Telegram/Discord auto-listing bot. Includes ~40–60 restyled
images/month.

Not a free feature — image generation costs Zolto per image — but priced
below buying a standalone AI photo tool (Pebblely, Flair AI) and a separate
chatbot app individually. See `marketing/ai-photography-pitch.md` for the
competitive comparison this is anchored to.

**Before this goes live:** confirm the included-image volume and margin
against Zolto's actual per-image generation cost.

---

## Comparison Table

| Feature | Free | Maker | Studio | Atelier |
|---------|------|-------|--------|---------|
| Products | 50 | Unlimited | Unlimited | Unlimited |
| Staff | 1 | 1 | 5 | 20 |
| Online Store | — | ✅ | ✅ + Domain | ✅ + Advanced |
| POS | Basic | Full | Full | Full + API |
| AI Descriptions | 10/mo | Unlimited | Unlimited | Unlimited + Custom |
| Bulk Upload | — | ✅ | ✅ | ✅ |
| Inventory Sync | — | ✅ | Real-time | Real-time |
| Analytics | Basic | Standard | Advanced | Custom |
| Support | Community | Email | Priority | Dedicated |

---

## Social Proof

> "I went from selling only at Christmas markets to my first online order in 3 days. I didn't have to learn Shopify or hire anyone."
> — **Sheena Arora**, Founder of Kalakosh, Zurich

---

## FAQ Section

**Can I upgrade or downgrade anytime?**
Yes. Changes take effect at your next billing cycle.

**Is there a contract?**
No. All plans are month-to-month. Cancel anytime.

**What happens after the 14-day trial?**
You'll be charged for the plan you selected. Cancel before the trial ends and you won't be charged.

**Do you charge transaction fees?**
No. We only charge the monthly subscription. Payment processing fees go to Stripe.

**Can I use Zolto just for POS (no online store)?**
Yes. The Maker plan includes both, but you can use just the POS if you prefer — perfect for market sellers like Sheena who want to add online later.

**Is my data safe?**
Yes. We use TLS 1.3 encryption, never store card numbers (Stripe handles that), and comply with GDPR.

**I'm not technical. Can I really set this up myself?**
Yes. Sheena at Kalakosh set up her store in 3 days with no prior experience. The AI guides you through everything.

---

## A/B Test Plan

### Test 1: Price Anchoring (Week 1–2)

**Variant A:** €19/month (current)
**Variant B:** €29/month (test higher price)

**Hypothesis:** Maker-focused positioning justifies premium pricing vs. generic tools.

**Metric:** Sign-up rate (visitors → trial start)

**Decision rule:**
- If B converts within 80% of A → B wins (more revenue per customer)
- If B converts <60% of A → A wins (volume matters more)
- If 60–80% → Extend test 1 more week

### Test 2: Plan Names (Week 3–4)

**Variant A:** Free / Maker / Studio / Atelier
**Variant B:** Free / Basic / Pro / Business

**Hypothesis:** Maker-themed names resonate better with target audience.

**Metric:** Click-through rate on "Most Popular" plan

### Test 3: Annual Discount (Week 5–6)

**Variant A:** Monthly only
**Variant B:** Monthly + "Save 20% with annual" (€15/month billed annually)

**Hypothesis:** Annual plans improve cash flow and retention.

**Metric:** % of sign-ups choosing annual

---

## Technical Notes

- Use Stripe Checkout for trial sign-up
- Track events: `pricing_page_view`, `plan_selected`, `trial_started`, `checkout_completed`
- Store variant assignment in cookie (consistent experience)
- Minimum 100 visitors per variant for statistical significance
