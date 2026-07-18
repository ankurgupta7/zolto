# Launch Diary #1: The Setup

> How Sheena Arora went from Christmas markets to her first online store —  
> **Part 1: Getting Started**

---

Sheena Arora makes jewelry. Not mass-produced, not dropshipped — handcrafted pieces in pearls and semi-precious stones, sold at Christmas markets and Chilbis along the Zurich Gold Coast. About 60 sales a month, all in person. No online store. Just a maker and her craft.

This is the story of how she set up her first online store. Not a growth-hacking case study. Not a "how I made six figures" narrative. Just a real maker figuring out how to sell online without becoming a tech person.

---

## The Maker

Sheena has been selling jewelry at markets for about a year. Necklaces, earrings, bracelets — each piece unique, built around pearls and semi-precious stones. The setup is familiar: foldable table, velvet display, Square reader for card payments. About 60 sales per month, mostly to repeat customers who find her at the same fairs along Lake Zurich.

The problem isn't sales. It's reach. Every market is a new audience. There's no way for someone who bought a pearl necklace at a Christmas market in Seefeld to tell a friend in Enge where to find Kalakosh online. The answer, until now, was "find me at the next Chilbi."

## The Decision

The decision to go online wasn't about scaling. It was about accessibility. Customers were asking: "Do you have a website?" The answer was always no. That gets awkward after the third time.

The requirements were simple:
- Show the jewelry online
- Let people buy without sending a WhatsApp message
- Keep the same inventory as the POS (no double-selling at a Chilbi)
- Don't require learning Shopify or hiring a developer

## The Setup Process

**Day 1: Product Upload**

Sheena started with 15 products. Not the full catalog — just the pieces that photograph well and sell consistently. The process:

1. **Photograph each product once, roughly** — a single phone photo, no studio, no lighting kit, no white background. Pearls laid out on a bedsheet at home.
2. **AI restyles the photo** — Zolto turns that one rough shot into a styled product photo (backdrop, lighting, composition) or a full lifestyle image (a model wearing the piece, a scene). No photographer booked. No model hired. No studio rented.

   **Disclosure:** in every AI-restyled image, the piece of jewelry is real — everything around it (backdrop, styling, and any model or scene) is AI-generated. Kalakosh discloses this on every AI-styled image, and so does Zolto: this isn't staged authenticity, it's a small maker being upfront about the tool she used.
3. **Upload to Zolto** — bulk CSV upload for speed.
4. **AI descriptions** — the AI generated product descriptions from the photos. Not perfect, but 80% there. Sheena edited them to match her voice.

**Time spent: under an hour.** The old bottleneck — booking a photographer, or a model, or renting a studio for a few product shots — is gone. Sheena's time went into picking which AI-restyled images to keep, not producing them.

**Day 2: Store Configuration**

- Set up shipping: flat rate CHF 8 Switzerland, CHF 15 EU. Simple.
- Connected Stripe for payments. Test mode first, then live.
- Matched the store colors to Kalakosh's brand (warm gold accents on cream).
- Added an "About" page with Sheena's story — how she started at Christmas markets, the meaning behind the name Kalakosh.

**Day 3: POS Sync**

This was the critical piece. Sheena's POS inventory (what's available at markets) needed to sync with the online store. If someone buys a bracelet at a Chilbi, it shouldn't show as available online 10 minutes later.

Zolto handles this automatically. One inventory database, two sales channels. When a sale happens on POS, the online stock updates. When an online order comes in, the POS knows.

**Time spent: 30 minutes.** It just worked.

## What We Learned

1. **Start small.** 15 products, not 150. You can always add more. Launching with everything creates paralysis.
2. **AI descriptions save time, but they need editing.** The AI captured the materials and dimensions accurately. It missed the emotional tone — the story behind why Sheena chooses pearls from a particular supplier, or how she matches stones. Sheena added that.
3. **POS sync is non-negotiable.** For anyone selling both online and in-person, this is the feature that prevents disasters.
4. **Photography used to be the bottleneck. AI removed it — at a fraction of the cost.** One rough phone photo per product, restyled by AI, disclosed as such. It's a paid add-on, not a free feature — but it's still far cheaper than booking a photographer, a model, or a studio, which is money a maker this size wouldn't have spent on her store otherwise.

## What's Next

The store is configured. Products are uploaded. Payments work. Tomorrow: the soft launch. Sheena will share the link with her existing customers via Instagram and WhatsApp. No ads. No promotion. Just: "Hey, we're finally online."

**Next in this series:** [Launch Diary #2: Going Live](/blog/launch-diary-2)

---

*This is Part 1 of a 4-part series documenting Sheena Arora's first online store launch. Sheena is the founder of Kalakosh, a pearl and semi-precious stone jewelry maker in Zurich, and the first customer on Zolto. Follow her journey from market stalls to hybrid commerce.*

**Published:** [Date]  
**Reading time:** 4 minutes  
**Keywords:** how to launch jewelry store online, pearl jewelry zurich, maker pos setup, craft business online store

---

## SEO Metadata

```html
<title>How Sheena Arora Set Up Kalakosh's First Online Store | Zolto Launch Diary</title>
<meta name="description" content="Follow Sheena Arora, founder of Kalakosh pearl jewelry in Zurich, as she sets up her first online store. Real process, real timeline, no growth hacks.">
```

## Schema Markup

```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "Launch Diary #1: The Setup",
  "description": "How Sheena Arora set up Kalakosh's first online store — real process, real timeline.",
  "author": {
    "@type": "Organization",
    "name": "Zolto"
  },
  "about": {
    "@type": "LocalBusiness",
    "name": "Kalakosh",
    "founder": {
      "@type": "Person",
      "name": "Sheena Arora"
    },
    "address": {
      "@type": "PostalAddress",
      "addressLocality": "Zurich",
      "addressCountry": "CH"
    }
  },
  "publisher": {
    "@type": "Organization",
    "name": "Zolto",
    "logo": {
      "@type": "ImageObject",
      "url": "https://zolto.com/logo.png"
    }
  },
  "datePublished": "2026-07-20",
  "dateModified": "2026-07-20",
  "mainEntityOfPage": {
    "@type": "WebPage",
    "@id": "https://zolto.com/blog/launch-diary-1"
  }
}
```
