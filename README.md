# Zolto — Multi-Tenant POS + E-commerce Platform for Artisan Sellers

[![CI](https://dl.circleci.com/status-badge/img/gh/ankurgupta7/zolto/tree/main.svg?style=svg)](https://dl.circleci.com/status-badge/redirect/gh/ankurgupta7/zolto/tree/main)

Zolto is a multi-tenant platform that powers online stores + in-person POS for artisan sellers (jewelry, crafts, boutiques). Built from the ground up based on real-world feedback from running a jewelry store in Zurich.

Each tenant gets:

- **Online store** — Product catalog, cart, Stripe Checkout (cards + TWINT)
- **POS system** — Android/iOS Tap to Pay, cash, TWINT QR
- **AI tools** — Bulk product creation from photos, Discord bot integration
- **Admin dashboard** — Inventory, analytics, staff management

**Stack:** React 19 + Tailwind 4 + Express 4 + tRPC 11 + Drizzle ORM + MySQL

> **Note:** Zolto is a fresh product built from scratch, inspired by real-world experience running a jewelry store in Zurich. Kalakosh (kalakosh.ch) remains a separate, independent business with its own repositories. Learnings from operating Kalakosh inform Zolto's design, but the codebases are entirely separate. Kalakosh has no special fallback or hardcoded references in Zolto — if they choose to migrate later, they'd be onboarded as a regular tenant like anyone else.

---

## Quick Facts

- **tRPC-first:** define procedures in `server/routers.ts`, consume them with `trpc.*` hooks.
- **Superjson out of the box:** return Drizzle rows directly—`Date` stays a `Date`.
- **Auth baked in:** `/api/oauth/callback` handles OAuth, `protectedProcedure` injects `ctx.user`; `adminProcedure` gates admin-only operations.
- **Gateway-ready:** all RPC traffic is under `/api/trpc`, making it easy to route at the edge.

---

## Continuous Integration

`.circleci/config.yml` runs four suites on **every push**, so a PR is verified
before merge and the merge commit on `main` is verified again. The badge at the
top of this file reads `main`.

| Job           | What it runs                                                                 |
| ------------- | ---------------------------------------------------------------------------- |
| `unit`        | `tsc --noEmit`, the full vitest suite (server + client), deploy-script tests |
| `integration` | `server/*.integration.test.ts` against **real Stripe test mode**             |
| `e2e`         | Playwright storefront journey against a freshly-migrated MySQL               |
| `android`     | ZoltoPOS contract tests, `gradle test`, and a debug APK                      |

The native iOS POS app (`ios/KalakoshPOS/`) is **not** built on CircleCI —
macOS executors aren't on the free plan. Its pipeline is
`.github/workflows/ios-pos-build.yml` (simulator build + unit/contract tests on
PRs, unsigned sideload IPA on merges to `main`), with the `ios-pos-*` Codemagic
workflows in `codemagic.yaml` covering signed device builds and acting as the
fallback when GitHub Actions minutes run out.

### One-time setup

1. **Add the project** in CircleCI (Projects → Set Up Project → it picks up
   `.circleci/config.yml` on the default branch).
2. **Set two environment variables** in Project Settings → Environment
   Variables — `STRIPE_TEST_SECRET_KEY` and `STRIPE_TEST_WEBHOOK_SECRET`.
   The `integration` job **fails deliberately if the first is missing** rather
   than passing: both Stripe suites `describe.skip` themselves without it, and
   a job that skips everything reports success while proving nothing. That is
   not hypothetical — it is how `billing.integration.test.ts` accumulated seven
   real failures unnoticed straight through the pricing pivot.
3. **Set `GITHUB_TOKEN`** (a PAT with `repo` / Actions-read scope). Only the
   cost-fallback below needs it; without it CircleCI simply runs everything.
4. **If the repo is private**, the badge needs a status token appended
   (Project Settings → Status Badges → create one), i.e.
   `.../tree/main.svg?style=svg&circle-token=<token>`. Public repos work as-is.

### Cost fallback: GitHub Actions first, CircleCI when it runs dry

`.github/workflows/android-build.yml` and `e2e.yml` cover the same ground as
this config's `android` and `e2e` jobs, so running both would pay twice for the
same work. Instead each of those two CircleCI jobs starts by asking GitHub
whether it already ran the equivalent workflow **for this exact commit**:

| GitHub's state for the commit           | CircleCI does           |
| --------------------------------------- | ----------------------- |
| Workflow ran and passed                 | halts (green, no spend) |
| Workflow ran and failed                 | fails, pointing at it   |
| Workflow never appeared                 | **runs the suite**      |
| Paths the workflow filters on unchanged | halts                   |
| Can't tell (no token, API error)        | **runs the suite**      |

The last row is the design rule: every ambiguous case resolves to _running_.
Duplicated work costs minutes; a silently skipped suite costs a broken merge.

**The important caveat.** GitHub gives no signal when an Actions allowance runs
out — it does not fail the workflow, it never schedules it. So "out of minutes"
is only observable as _absence_, and the check waits `GH_WAIT_SECONDS`
(default 180) before concluding nothing is coming. That is a heuristic: a
GitHub queue slower than the wait window looks the same as no budget, and the
result is a duplicated run, not a missed one. Set `FORCE_CIRCLECI_FULL=1` to
skip the whole dance and always run everything here.

Note also that GitHub Actions minutes are **free on public repositories** —
this fallback only ever engages on a private repo, or if Actions is disabled.

The logic lives in `.circleci/defer-to-github.sh` and is covered by
`.circleci/defer-to-github.test.sh` (run it directly; the `unit` job does too),
because a regression there would silently skip an entire suite.

`unit` and `integration` have no GitHub equivalent and always run — neither
GitHub workflow ever ran the vitest suite or the typecheck, which is the gap
this config closes.

---

## Build Loop (Four Touch Points)

1. Update schema in `drizzle/schema.ts`, then run `pnpm db:push` (see [`drizzle/README.md`](./drizzle/README.md) before running this against an existing production database).
2. Add database helpers in `server/db.ts` (return raw results).
3. Add or extend procedures in `server/routers.ts`, then wire the UI with `trpc.*.useQuery/useMutation`.
4. Build frontend experience according to `Frontend Workflow`
5. Cover your changes with Vitest specs inside `server/*.test.ts` (see `server/auth.logout.test.ts`, `server/products.test.ts`) and run `pnpm test`.

That's it—no manual REST routes, no Axios client, no shared contract files.

---

## Key Files

```
drizzle/schema.ts          → DB tables: users, products, productImages, instagramPosts, orders, bulkUploadLogs, posOrders, posOrderItems
server/db.ts               → Query helpers for all tables
server/routers.ts          → tRPC procedures (products, checkout, instagram + auth)
server/discord.ts          → Discord Gateway bot — listens for messages, LLM-parses product details, auto-creates product
server/stripe.ts           → Stripe Checkout webhook handler (marks orders paid, decrements stock)
server/pos.ts              → POS Terminal API (market-stall Tap to Pay via Android app)
server/storage.ts          → S3/R2 file upload helpers (storagePut)
client/src/App.tsx         → Routes, Navbar, Footer, CartDrawer, WhatsAppButton
client/src/lib/trpc.ts     → tRPC client binding
client/src/pages/          → Home, Shop, ProductDetail, Admin, BulkUpload, CsvImport, Checkout, About, Contact, Policy, Impressum
client/src/components/     → ProductCard, ProductModal, CartDrawer, Navbar, Footer, WhatsAppButton, ProductImageManager, InstagramManager
server/auth.logout.test.ts → Reference vitest test file
server/products.test.ts    → Products tRPC procedure tests
```

Framework plumbing (OAuth, context, Vite bridge) lives under `server/_core`.

---

## File Structure

```
client/
  public/              ← Small config files ONLY (favicon.ico, robots.txt). NO images/media.
  src/
    pages/             ← Home, Shop, ProductDetail, Admin, BulkUpload, CsvImport,
    |                     Checkout, CheckoutSuccess, CheckoutCancel, About, Contact,
    |                     Policy, Impressum, NotFound
    components/        ← Navbar, Footer, ProductCard, ProductModal, CartDrawer,
    |                     WhatsAppButton, ProductImageManager, InstagramManager,
    |                     ImageLightbox, ErrorBoundary (+ shadcn/ui under components/ui/)
    contexts/          ← CartContext, ThemeContext
    hooks/             ← useSmoothScroll, useMobile, useComposition, usePersistFn
    locales/           ← de.json, en.json (i18n via react-i18next)
    lib/trpc.ts        ← tRPC client
    lib/i18n.ts        ← i18next initialisation
    App.tsx            ← Routes, global layout (Navbar, Footer, CartDrawer, WhatsAppButton)
    main.tsx           ← Providers
    index.css          ← global style & CSS variables
android/               ← POS Terminal Android app (Tap to Pay)
ios/                   ← iOS apps: Kalakosh WebView companion + KalakoshPOS
  Kalakosh/            ← WebView companion app sources
  KalakoshPOS/         ← native POS Terminal app (Tap to Pay, TWINT, offline)
                         — migrated from ankurgupta7/kalakosh-pos-ios; CI in
                         .github/workflows/ios-pos-build.yml + codemagic.yaml
drizzle/               ← Schema & migrations
server/
  db.ts                ← All query helpers (users, products, images, orders, instagram, POS, logs)
  routers.ts           ← tRPC procedures (products, checkout, instagram, auth)
  discord.ts           ← Discord Gateway bot
  stripe.ts            ← Stripe Checkout webhook
  pos.ts               ← POS Terminal API
  storage.ts           ← S3/R2 upload helpers
  slack.ts             ← Slack Events API handler (optional)
  whatsapp.ts          ← WhatsApp Cloud API handler (optional)
  _core/               ← Framework plumbing (OAuth, context, LLM, storage proxy, Vite)
shared/                ← Shared constants & types
deploy/                ← backup.sh, recover-from-backup.sh
```

Only touch the files under "←" markers. Anything under `server/_core` is framework-level—avoid editing unless extending the infrastructure.

### ⚠️ Handling Images & Media

**DO NOT** store images, videos, or large assets in `client/public/` or `client/src/assets/`. Local media files will cause deployment timeouts.

**Required workflow:**

1. Upload assets using the CLI: `manus-upload-file --webdev path/to/image.png`
2. Use the returned storage path directly in your code: `<img src="/manus-storage/image_a1b2c3d4.png" />`
3. Store the original local file in `/home/ubuntu/webdev-static-assets/` (outside the project directory)

Only small configuration files like `favicon.ico`, `robots.txt`, and `manifest.json` belong in `client/public/`.

Files in `client/public` are available at the root of your site—reference them with absolute paths (`/robots.txt`, etc.) from HTML templates, JSX, or meta tags.

---

## Authentication Flow

- OAuth completes at `/api/oauth/callback` and drops a session cookie. On Manus platform this is Manus OAuth; in self-hosted mode it is Google OAuth (see `SELF_HOSTING.md`).
- Each request to `/api/trpc` builds context via `server/_core/context.ts`, making the current user available as `ctx.user`.
- Wrap protected logic in `protectedProcedure`; admin-only operations use `adminProcedure` (checks `ctx.user.role === "admin"`); public access uses `publicProcedure`.
- Frontend reads auth state with `trpc.auth.me.useQuery()` and invokes `trpc.auth.logout.useMutation()`—no cookie plumbing required.

---

## Environment Variables

Available pre-defined system envs:

- `DATABASE_URL`: MySQL/TiDB connection string
- `JWT_SECRET`: Session cookie signing secret
- `VITE_APP_ID`: Manus OAuth application ID
- `OAUTH_SERVER_URL`: Manus OAuth backend base URL
- `VITE_OAUTH_PORTAL_URL`: Manus login portal URL (frontend)
- `OWNER_OPEN_ID`, `OWNER_NAME`: Owner's info
- `BUILT_IN_FORGE_API_URL`: Manus built-in apis (includes llm, storage, data_api, notification, etc...)
- `BUILT_IN_FORGE_API_KEY`: Bearer token used by Manus built-in apis (server-side)
- `VITE_FRONTEND_FORGE_API_KEY`: Bearer token for frontend access to Manus built-in apis
- `VITE_FRONTEND_FORGE_API_URL`: Manus built-in apis URL for frontend

Do not edit these directly in code or commit `.env` files.
The envs above are system envs, when use env in website code, refer `server/_core/env.ts` for available list.

---

## Frontend Workflow

1. Choose a design style before you write any frontend code according to Design Guide (color, font, shadow, art style). Remember to edit `client/src/index.css` for global theming and add needed font using google font cdn in `client/index.html`.
2. Design the layout and navigation structure based on app purpose. Establish navigation in App.tsx accordingly:

- **Personal tools & internal dashboards** (finance trackers, task managers, admin panels, personal finance apps, analytics): Use DashboardLayout with sidebar navigation for consistent experience.
- **Public-facing products** (marketing sites, e-commerce, communities): Design custom navigation (top nav, contextual nav) and landing page to attract users.

3. Start by updating `client/src/pages/Home.tsx` (the landing page shell) using shadcn/ui components to introduce links, CTAs, or feature entry points.
4. Create or update additional components under `client/src/pages/FeatureName.tsx`, continuing to leverage shadcn/ui + Tailwind for consistent styling.
5. Register the route (or navigation entry) in `client/src/App.tsx`.
6. Read data with `const { data, isLoading } = trpc.feature.useQuery(params);`.
7. Mutate data with `trpc.feature.useMutation()`. Use optimistic updates for list operations, toggles, and profile edits. For critical operations (payments, auth), use `invalidate` with loading states.
8. Use `useAuth()` for current user state, login URL from `getLoginUrl()`, and avoid direct cookie handling.
9. Handle loading/empty/error states in the UI—tRPC already surfaces typed responses and errors.

---

## Frontend Development Guidelines

**tRPC & Data Management:**

- Use `trpc.*.useQuery/useMutation` for all backend calls—never introduce Axios/fetch wrappers.
- **Use optimistic updates for instant feedback**: ideal for adding/editing/deleting list items, toggling states, updating profiles. Use `onMutate` to update cache, `onError` to rollback (The onMutate/onError/onSettled pattern). For critical operations (payments, auth), prefer `invalidate` with explicit loading states.
- When using `invalidate` as fallback: call `trpc.useUtils().feature.invalidate()` in mutation's `onSuccess`.
- Auth state comes from `useAuth()`; do not manipulate cookies manually.

**UI & Styling:**

- Prefer shadcn/ui components for interactions to keep a modern, consistent look; import from `@/components/ui/*` (e.g., `button`, `card`, `dialog`).
- Compose Tailwind utilities with component variants for layout and states; avoid excessive custom CSS. Use built-in `variant`, `size`, etc. where available.
- Preserve design tokens: keep the `@layer base` rules in `client/src/index.css`. Utilities like `border-border` and `font-sans` depend on them.
- Consistent design language: use spacing, radius, shadows, and typography via tokens. Extract shared UI into `components/` for reuse instead of copy‑paste.
- Accessibility and responsiveness: keep visible focus rings and ensure keyboard reachability; design mobile‑first with thoughtful breakpoints.
- Theming: Choose dark/light theme to start with for ThemeProvider according to your design style (dark or light bg), then manage colors pallette with CSS variables in `client/src/index.css` instead of hard‑coding to keep global consistency.
- Micro‑interactions and empty states: add motion, empty states, and icons tastefully to improve quality without distracting from content.
- Navigation: For internal tools/admin panels, use persistent sidebar. For public-facing apps, design navigation based on content structure (top nav, side nav, or contextual)—ensure clear escape routes from all pages.
- Placeholder UI elements: When adding structural placeholders (nav items, table actions) for not-yet-implemented features, show toast on click ("Feature coming soon"). Inform user which elements are placeholders when presenting work.

**React Best Practices:**

- Never call setState/navigation in render phase → wrap in `useEffect`

**Customized Defaults:**
This template customizes some Tailwind/shadcn defaults for simplified usage:

- `.container` is customized to auto-center and add responsive padding (see `index.css`). Use directly without `mx-auto`/`px-*`. For custom widths, use `max-w-*` with `mx-auto px-4`.
- `.flex` is customized to have `min-width:0` and `min-height:0` by default
- `button` variant `outline` uses transparent background (not `bg-background`). Add bg color class manually if needed.

---

## 🎨 Design Guide

When generating frontend UI, avoid generic patterns that lack visual distinction:

- Avoid generic full-page centered layouts—prefer asymmetric/sidebar/grid structures for landing pages and dashboards
- Avoid applying dashboard/sidebar patterns to public-facing apps (forums, communities, e-commerce)—reserve those for internal tools
- When user provides vague requirements, make creative design decisions (choose specific color palette, typography, layout approach)
- Prioritize visual diversity: combine different design systems (e.g., one color scheme + different typography + another layout principle)
- For landing pages: prefer asymmetric layouts, specific color values (not just "blue"), and textured backgrounds over flat colors
- For dashboards: use defined spacing systems, soft shadows over borders, and accent colors for hierarchy

---

## Animation Guide

Bake motion taste in from the first line of code. Snappy, physically intuitive interactions are not a polish pass — they are part of the initial build.

- Decide whether to animate at all: keyboard-initiated actions (command palettes, shortcuts) must be instant — never animate them. High-frequency interactions (hover, list nav) should be minimal. Reserve richer motion for occasional events (modals, drawers, toasts) and rare delight moments (onboarding).
- Keep UI animations under 300ms. A 180ms dropdown feels significantly better than a 400ms one. Typical ranges: button press 100–160ms, tooltips 125–200ms, dropdowns 150–250ms, modals/drawers 200–500ms.
- Use strong custom easings, not the weak CSS defaults. Default to a snappy ease-out for entering/exiting UI: `--ease-out: cubic-bezier(0.23, 1, 0.32, 1);`. For moving/morphing use `--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);`. NEVER use `ease-in` for UI animations — it feels sluggish.
- Buttons must feel responsive: add `transform: scale(0.97)` on `:active` with a ~160ms ease-out transition so the UI confirms it heard the user.
- Never animate from `scale(0)` — nothing in the real world appears from nothing. Start from `scale(0.95)` combined with `opacity: 0`.
- Origin-aware popovers/dropdowns: scale in from the trigger point (e.g. `transform-origin: var(--radix-popover-content-transform-origin)`). Modals are the exception and stay centered.
- Prefer CSS transitions over @keyframes for dynamic UI state. Transitions can be interrupted and reversed smoothly mid-flight; keyframes restart from zero and feel broken when interrupted.
- Only animate `transform` and `opacity` for motion — they run on the GPU and skip layout/paint. Avoid animating `width`, `height`, `padding`, `margin`, `top/left` unless absolutely necessary.
- Stagger grouped entrances by 30–80ms per item to create a cascading reveal instead of a wall of motion.
- Asymmetric timing for deliberate actions: hold-to-confirm should be slow and linear on press (e.g. 2s linear), but release/cancel should snap back fast (~200ms ease-out).
- Respect `prefers-reduced-motion`: gate non-essential motion behind `@media (prefers-reduced-motion: no-preference)`.

---

## Feature Checklist

- [ ] Tables updated in `drizzle/schema.ts`, migrations pushed (`pnpm db:push`)
- [ ] Query helper added in `server/db.ts` (returns raw Drizzle rows)
- [ ] Procedure created in `server/routers.ts` (choose `public` vs `protected`)
- [ ] UI calls the procedure via `trpc.*.useQuery/useMutation`
- [ ] Success + error paths verified in the browser

---

## Pre-built Components

Before implementing UI features, check if these components already exist:

Dashboard & Layout:

- `client/src/components/DashboardLayout.tsx` - Full dashboard layout with sidebar navigation, auth handling, and user profile. Use this for any admin panel or dashboard-style app instead of building from scratch.
- `client/src/components/DashboardLayoutSkeleton.tsx` - Loading skeleton for dashboard during auth checks

Chat & Messaging:

- `client/src/components/AIChatBox.tsx` - Full-featured chat interface with message history, streaming support, and markdown rendering. Use this for any chat/conversation UI instead of building from scratch.

Maps:

- `client/src/components/Map.tsx` - Google Maps integration with proxy authentication. Provides MapView component with onMapReady callback for initializing Google Maps services (Places, Geocoder, Directions, Drawing, etc.). All map functionality works directly in the browser.

When implementing features that match these categories, MUST evaluate the component first to decide whether to use or customize it.

---

## Internal Tools & Admin Panels

For certain app types, this template provides DashboardLayout—a standardized sidebar pattern.

**Use DashboardLayout for:**

- Admin/management dashboards
- Personal productivity apps (task managers, note-taking)
- Analytics/monitoring tools

**Do NOT use for:**

- Public content platforms (forums, blogs, social networks)
- E-commerce storefronts
- Marketing/landing sites

**Layout & Navigation**

- Use `DashboardLayout` component from `client/src/components/DashboardLayout.tsx` and remove any page-level headers to avoid duplication.
- When use DashboardLayout, read its content before making changes and preserve its core structure by default.

**Role-based Access Control**
When building apps with distinct access levels (e.g., e-commerce with public home, user account, admin panel):

- The `user` table includes a `role` field (enum: `admin` | `user`) for identity separation
- Use `ctx.user.role` in procedures to gate admin-only operations
- Wrap admin-only backend logic in `adminProcedure`
- Frontend can conditionally render navigation/routes based on `useAuth().user?.role`

Example procedure pattern:

```ts
adminOnlyProcedure: protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
  return next({ ctx });
}),
```

**Managing Admins**

- To promote a user to admin, update the `role` field directly in the database via the system UI or SQL
- If you need additional roles beyond `admin`/`user`, extend the enum in `drizzle/schema.ts` and push the migration

---

## LLM Integration

Use the preconfigured LLM helpers. Credentials are injected from the platform (no manual setup required).

```ts
import { invokeLLM } from "./server/_core/llm";

/**
 * Simple chat completion
 * type Role = "system" | "user" | "assistant" | "tool" | "function";
 * type TextContent = {
 *   type: "text";
 *   text: string;
 * };
 *
 * type ImageContent = {
 *   type: "image_url";
 *   image_url: {
 *     url: string;
 *     detail?: "auto" | "low" | "high";
 *   };
 * };
 *
 * type FileContent = {
 *   type: "file_url";
 *   file_url: {
 *     url: string;
 *     mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4" ;
 *   };
 * };
 *
 * export type Message = {
 *   role: Role;
 *   content: string | Array<ImageContent | TextContent | FileContent>
 * };
 *
 * Supported parameters:
 * messages: Array<{
 *   role: 'system' | 'user' | 'assistant' | 'tool',
 *   content: string | { tool_call: { name: string, arguments: string } }
 * }>
 * tool_choice?: 'none' | 'auto' | 'required' | { type: 'function', function: { name: string } }
 * tools?: Tool[]
 */
const response = await invokeLLM({
  messages: [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "Hello, world!" },
  ],
});
```

Tips

- Always call llm functions from server-side code (e.g., inside tRPC procedures), to avoid exposing your API key.
- LLM calls deduct from this project's credit balance.
- All models support streaming, but `invokeLLM()` doesn't expose `stream` — modify the helper to pass `stream: true` and parse the SSE response if you need it. When proxying SSE, listen on `res` close (not `req`) and guard with a `finished` flag, or the upstream gets aborted after the first event.
- LLM responses often contain markdown. Use `<Streamdown>{content}</Streamdown>` (imported from `streamdown`) to render markdown content with proper formatting and streaming support.

### Listing Available Models

```ts
import { listLLMModels } from "./server/_core/llm";

const { data } = await listLLMModels();
const ids = data.map((m) => m.id);
```

Returns OpenAI-standard model metadata for each available ID. From the project shell you can also peek at it directly: `curl "$BUILT_IN_FORGE_API_URL/v1/models" -H "Authorization: Bearer $BUILT_IN_FORGE_API_KEY"`.

**Combine with `invokeLLM`** to discover IDs at runtime instead of hardcoding:

```ts
import { invokeLLM, listLLMModels } from "./server/_core/llm";

const { data } = await listLLMModels();
const model = data.find((m) => m.id.startsWith("claude-"))?.id;

const response = await invokeLLM({
  model,
  messages: [{ role: "user", content: "Hello" }],
});
```

### Thinking / Reasoning

`invokeLLM()` forwards `thinking` and `reasoning` extension params unchanged (no defaults). Per model family:

- OpenAI gpt-5 family — `reasoning: { effort: "minimal" | "low" | "medium" | "high" }`
- Anthropic claude family — `thinking: { type: "enabled", budget_tokens: 2048 }`
- Google gemini family — `thinking: { budget_tokens: 1024 }`

```ts
await invokeLLM({
  model: "claude-sonnet-4-6",
  messages: [...],
  thinking: { type: "enabled", budget_tokens: 2048 },
});

await invokeLLM({
  model: "gpt-5",
  messages: [...],
  reasoning: { effort: "low" },
});
```

For the exact shape per model, check `capabilities.thinking_example` from the `/models` catalog (see Tips above).

### Structured Responses (JSON Schema)

Ask the model to return structured JSON via `response_format`:

```ts
import { invokeLLM } from "./server/_core/llm";

const structured = await invokeLLM({
  messages: [
    {
      role: "system",
      content: "You are a helpful assistant designed to output JSON.",
    },
    {
      role: "user",
      content:
        'Extract the name and age from the following text: "My name is Alice and I am 30 years old."',
    },
  ],
  response_format: {
    type: "json_schema",
    json_schema: {
      name: "person_info",
      strict: true,
      schema: {
        type: "object",
        properties: {
          name: { type: "string", description: "The name of the person" },
          age: { type: "integer", description: "The age of the person" },
        },
        required: ["name", "age"],
        additionalProperties: false,
      },
    },
  },
});

// The model responds with JSON content matching the schema.
// Access via `structured.choices[0].message.content` and JSON.parse if needed.
```

The helpers mirror the Python SDK semantics but produce JavaScript-first code, keeping credentials inside the server and ensuring every environment has access to the same token.

---

## Voice Transcription Integration

Use the preconfigured voice transcription helper that converts speech to text using Whisper API, no manual setup required.

Example usage:

```ts
import { transcribeAudio } from "./server/_core/voiceTranscription";

const result = await transcribeAudio({
  audioUrl: "https://storage.example.com/audio/recording.mp3",
  language: "en", // Optional: helps improve accuracy
  prompt: "Transcribe meeting notes", // Optional: context hint
});

// Returns native Whisper API response
// result.text - Full transcription
// result.language - Detected language (ISO-639-1)
// result.segments - Timestamped segments with metadata
```

Tips

- Accepts URL to pre-uploaded audio file
- 16MB file size limit enforced during transcription, size flag to be set by frontend
- Supported formats: webm, mp3, wav, ogg, m4a
- Returns native Whisper API response with rich metadata
- Frontend should handle audio capture, storage upload, and size validation

---

## Image Generation Integration

Use the preconfigured image generation helper that connects to the internal ImageService, no manual setup required.

Example usage:

```ts
import { generateImage } from "./server/_core/imageGeneration.ts";

const { url: imageUrl } = await generateImage({
  prompt: "A serene landscape with mountains",
});
// For editing:
const { url: imageUrl } = await generateImage({
  prompt: "Add a rainbow to this landscape",
  originalImages: [
    {
      url: "https://example.com/original.jpg",
      mimeType: "image/jpeg",
    },
  ],
});
```

Tips

- Always call from server-side code (e.g., inside tRPC procedures) to avoid exposing API keys
- Image generation can take 5-20 seconds, implement proper loading states
- Implement proper error handling as image generation can fail

---

## ☁️ File Storage

Use the preconfigured storage helpers in `server/storage.ts`. Credentials are injected from the platform (no manual setup required). Files are stored securely and served via the built-in `/manus-storage/` path — no manual URL management needed.

```ts
import { storagePut } from "./server/storage";

// Upload bytes to storage
const fileKey = `${userId}-files/${fileName}.png`;
const { key, url } = await storagePut(
  fileKey,
  fileBuffer, // Buffer | Uint8Array | string
  "image/png",
);
// url = "/manus-storage/{key}" — use directly in frontend code
// key = unique storage key — save in database
```

Tips

- Save the `key` or `url` in your database; use storage for the actual file bytes. This applies to all files including images, documents, and media.
- For file uploads, have the client POST to your server, then call `storagePut` from your backend.
- The returned `url` (e.g. `/manus-storage/...`) is automatically served via signed redirect — no manual URL signing needed.
- To delete a file, drop its `key` from your DB and any UI references — the key is the only way to reach the object, so an unreferenced file is effectively gone. Do not implement a helper to remove the underlying object; the template's storage layer does not expose a delete endpoint.

---

## 🗺️ Maps Integration

**CRITICAL: The Manus proxy provides FULL access to ALL Google Maps features** - including advanced drawing, heatmaps, Street View, all layers, Places API, etc. Do ask users for Google Map API keys - authentication is automatic.

**Default: Use Frontend SDK** - Import MapView from `client/src/components/Map.tsx` and initialize ANY Google Maps service (geocoding, directions, places, drawing, visualization, geometry, etc.) in the onMapReady callback.

**Use Backend API only when:**

- Persisting data (save routes/locations to database)
- Bulk operations (1000+ addresses)
- Server-side needs (caching, scheduled jobs, hiding business logic)

**Implementation:**

- Frontend: See `client/src/components/Map.tsx` for component usage - ALL Google Maps JavaScript API features work
- Backend: Create tRPC procedures using `makeRequest` from `server/_core/map.ts`

NEVER use external map libraries or request API keys from users - the Manus proxy handles everything automatically with no feature limitations.

---

## ☁️ Data API

When you need external data, use the omni_search with search_type = 'api' to see there's any built-in api available in Manus API Hub access. You only have to connect other api if there's no suitable built-in api available.

---

## Owner Notifications

This template already ships with a `notifyOwner({ title, content })` helper (`server/_core/notification.ts`) and a protected tRPC mutation at `trpc.system.notifyOwner`. Use it whenever backend logic needs to push an operational update to the Manus project owner—common triggers are new form submissions, survey feedback, or workflow results.

1. On the server, call `await notifyOwner({ title, content })` or reuse the provided `system.notifyOwner` mutation from jobs/webhooks (`trpc.system.notifyOwner.useMutation()` on the client).
2. Handle the boolean return (`true` on success, `false` if the upstream service is temporarily unavailable) to decide whether you need a fallback channel.

Keep this channel for owner-facing alerts; end-user messaging should flow through your app-specific systems.

---

## ⏱ Datetime & Timezone

Persistence: Store all business timestamps as UTC-based Unix timestamps (milliseconds since epoch) at the database and API layer. Do not store client-local, timezone-dependent, or string-based timestamps unless explicitly required as separate fields.
Frontend display: In React components, always convert UTC timestamps to the user’s local timezone for display e.g. new Date(utcTimestamp).toLocaleString(). Keep all internal state and API interactions in UTC timestamps to avoid drift and confusion.

---

## Tips

- Keep router files under ~150 lines—split into `server/routers/<feature>.ts` once they grow.
- Show loading states at component level (spinners, skeletons) rather than blocking entire pages—keeps the app feeling responsive.

---

## Core File References

Note: All TODO comments are remarks for the agent (you), not for the user.

`package.json` (key fields only)

```json
{
  "name": "kalakosh-jewellery",
  "scripts": {
    "dev": "NODE_ENV=development tsx watch server/_core/index.ts",
    "build": "vite build && esbuild server/_core/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist",
    "start": "NODE_ENV=production node dist/index.js",
    "test": "vitest run",
    "db:push": "drizzle-kit generate && drizzle-kit migrate"
  }
}
```

Notable dependencies: `stripe`, `ws` (Discord WebSocket Gateway), `i18next` + `react-i18next` (DE/EN), `lenis` (smooth scroll), `framer-motion`, `embla-carousel-react`, `@aws-sdk/client-s3`.

`drizzle/schema.ts`

```ts
import {
  boolean,
  decimal,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const products = mysqlTable("products", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description").notNull(),
  nameEn: varchar("nameEn", { length: 255 }),
  descriptionEn: text("descriptionEn"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  category: mysqlEnum("category", [
    "Silver",
    "Semi-Precious Gems",
    "Pearls",
  ]).notNull(),
  imageKey: varchar("imageKey", { length: 512 }),
  imageUrl: varchar("imageUrl", { length: 1024 }),
  visible: boolean("visible").default(true).notNull(),
  sold: boolean("sold").default(false).notNull(),
  quantity: int("quantity").default(1).notNull(),
  source: mysqlEnum("source", ["whatsapp", "manual"])
    .default("manual")
    .notNull(),
  discordMessageId: varchar("discordMessageId", { length: 64 }).unique(), // dedup guard
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const productImages = mysqlTable("product_images", {
  id: int("id").autoincrement().primaryKey(),
  productId: int("productId").notNull(),
  imageKey: varchar("imageKey", { length: 512 }).notNull(),
  imageUrl: varchar("imageUrl", { length: 1024 }).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const instagramPosts = mysqlTable("instagram_posts", {
  id: int("id").autoincrement().primaryKey(),
  postUrl: varchar("postUrl", { length: 1024 }).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const orders = mysqlTable("orders", {
  id: int("id").autoincrement().primaryKey(),
  stripeSessionId: varchar("stripeSessionId", { length: 255 })
    .notNull()
    .unique(),
  stripePaymentIntentId: varchar("stripePaymentIntentId", { length: 255 }),
  status: mysqlEnum("status", ["pending", "paid", "failed", "expired"])
    .default("pending")
    .notNull(),
  customerEmail: varchar("customerEmail", { length: 320 }),
  customerName: varchar("customerName", { length: 255 }),
  amountTotal: int("amountTotal").notNull(), // Rappen (CHF × 100)
  currency: varchar("currency", { length: 10 }).default("chf").notNull(),
  productIds: varchar("productIds", { length: 512 }).notNull(),
  paymentMethod: varchar("paymentMethod", { length: 32 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const bulkUploadLogs = mysqlTable("bulk_upload_logs", {
  id: int("id").autoincrement().primaryKey(),
  operation: mysqlEnum("operation", [
    "analyze",
    "create",
    "extra_image",
  ]).notNull(),
  ref: varchar("ref", { length: 512 }).notNull(),
  errorMessage: text("errorMessage").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const posOrders = mysqlTable("pos_orders", {
  id: int("id").autoincrement().primaryKey(),
  stripePaymentIntentId: varchar("stripePaymentIntentId", { length: 255 })
    .notNull()
    .unique(),
  status: mysqlEnum("status", ["pending", "paid", "failed"])
    .default("pending")
    .notNull(),
  totalRappen: int("totalRappen").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const posOrderItems = mysqlTable("pos_order_items", {
  id: int("id").autoincrement().primaryKey(),
  posOrderId: int("posOrderId").notNull(),
  productId: int("productId").notNull(),
  priceRappen: int("priceRappen").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
```

`server/db.ts` (key exports — full file at `server/db.ts`)

```ts
// Users
export async function upsertUser(user: InsertUser): Promise<void>;
export async function getUserByOpenId(openId: string);

// Products
export async function getVisibleProducts(); // visible=true AND imageUrl IS NOT NULL, newest first
export async function getAllProducts(); // all products including hidden, newest first
export async function getProductById(id: number);
export async function getVisibleProductById(id: number);
export async function getProductByDiscordMessageId(discordMessageId: string);
export async function getProductsByIds(ids: number[]);
export async function createProduct(data: InsertProduct);
export async function updateProduct(id: number, data: Partial<InsertProduct>);
export async function setProductVisibility(id: number, visible: boolean);
export async function setProductSold(id: number, sold: boolean);
export async function setProductQuantity(id: number, quantity: number);
export async function markProductsSold(ids: number[]); // decrements quantity, flips sold at 0
export async function deleteProduct(id: number);

// Product Images
export async function getProductImages(productId: number); // ordered by sortOrder, createdAt
export async function addProductImage(data: InsertProductImage);
export async function deleteProductImage(id: number);
export async function deleteAllProductImages(productId: number);

// Instagram Posts
export async function getInstagramPosts();
export async function addInstagramPost(postUrl: string, sortOrder: number);
export async function deleteInstagramPost(id: number);
export async function reorderInstagramPost(id: number, sortOrder: number);

// Orders (Stripe Checkout)
export async function createOrder(data: InsertOrder);
export async function getOrderBySessionId(stripeSessionId: string);
export async function updateOrderBySessionId(
  stripeSessionId: string,
  data: Partial<InsertOrder>,
);

// Bulk Upload Logs
export async function insertBulkUploadLog(data: InsertBulkUploadLog);
export async function getBulkUploadLogs(limit?: number);
```

`server/routers.ts` (structure — full 746-line file at `server/routers.ts`)

```ts
// adminProcedure = protectedProcedure + ctx.user.role === "admin" guard

const productsRouter = router({
  list,            // public — visible products, optional category filter ("Silver"|"Semi-Precious Gems"|"Pearls")
  getById,         // public — single visible product
  adminList,       // admin — all products including hidden
  toggleVisibility,// admin — show/hide a product
  toggleSold,      // admin — mark sold/available
  setQuantity,     // admin — set stock; auto-flips sold=true at 0
  delete,          // admin — permanent delete
  getImages,       // public — product image gallery (sorted)
  addImage,        // admin — base64 upload → S3 → addProductImage; promotes to primary if none
  deleteImage,     // admin
  bulkAnalyze,     // admin — AI vision on up to 20 groups (8 images each) → bilingual name/desc/category
  bulkCreate,      // admin — batch S3 upload + createProduct for up to 20 items
  csvImport,       // admin — import up to 500 rows from CSV/Google Sheets
  parseHandwrittenInventory, // admin — AI vision on photo of handwritten notes → structured rows
  fetchSheetCsv,   // admin — server-side Google Sheets CSV fetch (bypasses CORS)
  getBulkLogs,     // admin — recent bulk upload AI error logs
  create,          // admin — manual product creation
  update,          // admin — edit name/description/price/category
});

const instagramRouter = router({
  list,    // public — ordered Instagram post embed URLs
  add,     // admin — must be instagram.com URL
  delete,  // admin
  reorder, // admin
});

const checkoutRouter = router({
  config,        // public — { enabled: boolean } (true when STRIPE_SECRET_KEY is set)
  createSession, // public — creates Stripe Checkout Session (cards + TWINT, CHF, CH shipping only)
  orderStatus,   // public — poll order status after returning from Stripe
});

export const appRouter = router({
  system,    // platform system procedures
  auth: { me, logout },
  products: productsRouter,
  instagram: instagramRouter,
  checkout: checkoutRouter,
});
```

`client/src/App.tsx`

```tsx
// Routes defined in Router():
//   /                  → Home
//   /shop              → Shop (product grid + category filter)
//   /about             → About
//   /contact           → Contact
//   /checkout          → Checkout (cart review → Stripe)
//   /checkout/success  → CheckoutSuccess
//   /checkout/cancel   → CheckoutCancel
//   /policy            → Policy
//   /impressum         → Impressum
//   /product/:id       → ProductDetail (full-screen with image carousel)
//   /admin             → Admin (product management dashboard)
//   /admin/bulk-upload → BulkUpload (AI-powered batch image → product creation)
//   /admin/csv-import  → CsvImport (CSV / Google Sheets import)

// Global layout wrapping every route: <Navbar /> + <Footer /> + <WhatsAppButton /> + <CartDrawer />
// Providers: ThemeProvider (light), CartProvider, TooltipProvider
```

`client/src/lib/trpc.ts`

```ts
import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "../../../server/routers";

export const trpc = createTRPCReact<AppRouter>();
```

`server/auth.logout.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";

type CookieCall = {
  name: string;
  options: Record<string, unknown>;
};

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): {
  ctx: TrpcContext;
  clearedCookies: CookieCall[];
} {
  const clearedCookies: CookieCall[] = [];

  const user: AuthenticatedUser = {
    id: 1,
    openId: "sample-user",
    email: "sample@example.com",
    name: "Sample User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };

  return { ctx, clearedCookies };
}

describe("auth.logout", () => {
  it("clears the session cookie and reports success", async () => {
    const { ctx, clearedCookies } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.logout();

    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.name).toBe(COOKIE_NAME);
    expect(clearedCookies[0]?.options).toMatchObject({
      maxAge: -1,
      secure: true,
      sameSite: "none",
      httpOnly: true,
      path: "/",
    });
  });
});
```

---

## Common Pitfalls

### Infinite loading loops from unstable references

**Anti-pattern:** Creating new objects/arrays in render that are used as query inputs

```tsx
// ❌ Bad: New Date() creates new reference every render → infinite queries
const { data } = trpc.items.getByDate.useQuery({
  date: new Date(), // ← New object every render!
});

// ❌ Bad: Array/object literals in query input
const { data } = trpc.items.getByIds.useQuery({
  ids: [1, 2, 3], // ← New array reference every render!
});
```

**Correct approach:** Stabilize references with useState/useMemo

```tsx
// ✅ Good: Initialize once with useState
const [date] = useState(() => new Date());
const { data } = trpc.items.getByDate.useQuery({ date });

// ✅ Good: Memoize complex inputs
const ids = useMemo(() => [1, 2, 3], []);
const { data } = trpc.items.getByIds.useQuery({ ids });
```

**Why this happens:** TRPC queries trigger when input references change. Objects/arrays created in render have new references each time, causing infinite re-fetches.

### Storing file bytes in database columns

**Anti-pattern:** Adding BLOB/BYTEA columns to store file content

```ts
// ❌ Bad: Database bloat and slow queries
export const files = sqliteTable("files", {
  content: blob("content"), // Never store file bytes
});
```

**Correct approach:** Store S3 reference only, upload file bytes to S3

```ts
// ✅ Good: Store metadata + S3 reference
export const files = sqliteTable("files", {
  url: text("url").notNull(), // Url to reference the file in s3
  fileKey: text("file_key").notNull(), // also save file_key for clarity
  // optional, save other metadata if needed
  // filename: text('filename'),
  // mimeType: text('mime_type'),
});
```

Use `storagePut()` to upload files (see S3 File Storage section).

### Navigation dead-ends in subpages

**Problem:** Creating nested routes without escape routes—no header nav, no sidebar, no back button.

**Root cause:** Implementing individual pages before establishing global layout structure.

**Solution:** Define layout wrapper in App.tsx first, then build pages inside it. For admin tools use DashboardLayout; for detail pages add back button with `router.back()`.

### Invisible text from theme/color mismatches

**Root cause:** Semantic colors (`bg-background`, `text-foreground`) are CSS variables that resolve based on ThemeProvider's active theme. Mismatches cause invisible text.

**Two critical rules:**

1. **Match theme to CSS variables:** If `defaultTheme="dark"` in App.tsx, ensure `.dark {}` in index.css has dark background + light foreground values
2. **Always pair bg with text:** When using `bg-{semantic}`, MUST also use `text-{semantic}-foreground` (not automatic - text inherits from parent otherwise)

**Quick reference:**

```tsx
// ✅ Theme + CSS alignment
<ThemeProvider defaultTheme="dark">  {/* Must match .dark in index.css */}
  <div className="bg-background text-foreground">...</div>
</ThemeProvider>

// ✅ Required class pairs
<div className="bg-popover text-popover-foreground">...</div>
<div className="bg-card text-card-foreground">...</div>
<div className="bg-accent text-accent-foreground">...</div>
```

### Nested anchor tags in Link components

**Problem:** Wrapping `<a>` tags inside another `<a>` or wouter's `<Link>` creates nested anchors and runtime errors.

**Solution:** Pass children directly to Link—it already renders an `<a>` internally.

```tsx
// ❌ Bad: <Link><a>...</a></Link> or <a><a>...</a></a>
// ✅ Good: <Link>...</Link> or just <a>...</a>
```

### Empty `Select.Item` values

**Rule:** Every `<Select.Item>` must have a non-empty `value` prop—never `""`, `undefined`, or omitted.

---

## Manus OAuth Best Practices

**Key Rule:** Always use `window.location.origin` for redirect URLs—never hardcode domains or use `req.host`. Frontend and backend run on separate servers, so the frontend must pass its origin explicitly.

**Unsupported browsers:** Safari Private Browsing, Firefox Strict ETP, Brave Aggressive Shields, or any browser blocking cookies.

**Anti-patterns:**

```ts
// ❌ Never construct URLs from env vars or patterns
const url = `https://${projectName}.manus.space/callback`;
const url = `https://${process.env.APP_SUBDOMAIN}.example.com/verify`;
```

**Correct approach:** This template already implements the pattern correctly:

- `client/src/const.ts`: `getLoginUrl(returnPath?)` encodes origin + returnPath in state
- `server/_core/oauth.ts`: `parseState()` extracts origin from state for redirects

**For invite/magic links:** When backend generates URLs, frontend must pass origin in the request:

```ts
// Frontend
const createInvite = trpc.invites.create.useMutation();
await createInvite.mutateAsync({
  eventId: "123",
  origin: window.location.origin,
});

// Backend - use input.origin to build the URL
const inviteUrl = `${input.origin}/events/${eventId}/join?token=${token}`;
```
