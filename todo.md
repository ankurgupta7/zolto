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
