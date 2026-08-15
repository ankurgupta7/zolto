// Vitest setup — load the repo-root .env into process.env before any test
// module is evaluated. Vitest only exposes VITE_* vars from .env files on
// import.meta.env; server-side tests (e.g. server/stripe.integration.test.ts)
// read plain process.env at module top level, so without this their keys
// (STRIPE_TEST_SECRET_KEY etc.) are undefined and those suites auto-skip even
// when .env is filled in. dotenv does not override vars already set in the
// real environment, so CI secrets and inline overrides still win.
import "dotenv/config";

// jsdom implements no ResizeObserver, and Recharts' ResponsiveContainer
// constructs one on mount — so ANY component with a chart in it throws
// "ResizeObserver is not defined" during render and takes its whole suite down,
// including the assertions that have nothing to do with the chart.
//
// A no-op stub is the honest shape here: it reports no size, so the chart
// renders empty and no test can accidentally assert on plotted geometry that
// jsdom never laid out. Charts are verified by screenshot instead (CLAUDE.md).
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
