// Vitest setup — load the repo-root .env into process.env before any test
// module is evaluated. Vitest only exposes VITE_* vars from .env files on
// import.meta.env; server-side tests (e.g. server/stripe.integration.test.ts)
// read plain process.env at module top level, so without this their keys
// (STRIPE_TEST_SECRET_KEY etc.) are undefined and those suites auto-skip even
// when .env is filled in. dotenv does not override vars already set in the
// real environment, so CI secrets and inline overrides still win.
import "dotenv/config";
