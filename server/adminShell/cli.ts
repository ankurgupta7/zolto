#!/usr/bin/env node
/**
 * `zolto-admin` — the interactive administration shell.
 *
 * Run it on the server, where DATABASE_URL points at the live database:
 *
 *     bash deploy/admin.sh                 # inside the running app container
 *     bash deploy/admin.sh --read-only     # look, don't touch
 *     npx tsx server/adminShell/cli.ts     # from a dev checkout
 *
 * It asks what you want to do, in tiers, and does it by calling the very same
 * tRPC procedures the web consoles call — see caller.ts for why that matters.
 *
 * This file is bootstrap only: environment, database, operator identity, and
 * the readline wiring. All behaviour lives in shell.ts and actions/.
 */

import "dotenv/config";
import { pathToFileURL } from "node:url";
import { NotAnOperatorError } from "./caller";
import { chooseFrom } from "./choose";
import { getDb, getTenantBySlug, listPlatformOperators } from "../db";
import { orDash, timestamp } from "./format";
import { createReadlineIo, type Io, ShellExit } from "./io";
import { menu } from "./menu";
import { defaultSessionDeps, ShellSession } from "./session";
import { runShell } from "./shell";

export interface CliArgs {
  readOnly: boolean;
  /** Start pointed at this store (slug), skipping the first picker. */
  store: string | null;
  /** Act as this superadmin, when the platform has more than one. */
  as: string | null;
  help: boolean;
}

export function parseArgs(argv: readonly string[]): CliArgs {
  const args: CliArgs = { readOnly: false, store: null, as: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--read-only" || arg === "-r") args.readOnly = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--store" || arg === "-s") args.store = argv[++i] ?? null;
    else if (arg.startsWith("--store=")) args.store = arg.slice(8);
    else if (arg === "--as") args.as = argv[++i] ?? null;
    else if (arg.startsWith("--as=")) args.as = arg.slice(5);
  }
  return args;
}

const USAGE = `
Zolto admin shell — every administrative operation, in tiers.

  Usage: node dist/admin.js [options]
         npx tsx server/adminShell/cli.ts [options]

  --read-only, -r     Refuse every option that writes.
  --store, -s <slug>  Start pointed at this store.
  --as <email>        Act as this platform owner (when there is more than one).
  --help, -h          This text.

  At any menu: a number picks an option, [b] goes back, [h] returns to the
  top, [?] explains the options, [q] quits.
`.trim();

/**
 * Decide which platform owner the shell acts as.
 *
 * The shell never invents authority. It is only as privileged as the
 * `superadmin` row it is handed — so a deployment with none gets no shell, and
 * says how to grant one rather than leaving the operator to guess.
 */
export async function resolveOperator(
  io: Io,
  operators: Awaited<ReturnType<typeof listPlatformOperators>>,
  requestedEmail: string | null,
) {
  if (operators.length === 0) {
    io.print("");
    io.print("  No account on this platform has the superadmin role, so there");
    io.print("  is nothing for this shell to act as. Grant it on the server:");
    io.print("");
    io.print("      bash deploy/tenant-admin.sh --superadmin <email>");
    io.print("");
    io.print("  (The account must have signed in at least once.)");
    return null;
  }

  const wanted = (requestedEmail ?? process.env.ADMIN_EMAIL ?? "")
    .trim()
    .toLowerCase();
  if (wanted) {
    const match = operators.find((u) => u.email?.toLowerCase() === wanted);
    if (match) return match;
    if (requestedEmail) {
      io.print(`  ${requestedEmail} is not a platform owner here.`);
    }
  }

  if (operators.length === 1) return operators[0];

  return chooseFrom(io, {
    title: "  Platform owners",
    rows: operators,
    empty: "No platform owners.",
    searchable: (u) => [String(u.id), u.email ?? "", u.name ?? ""],
    columns: [
      { label: "id", align: "right", value: (u) => String(u.id) },
      { label: "email", value: (u) => orDash(u.email) },
      { label: "name", value: (u) => orDash(u.name) },
      { label: "last seen", value: (u) => timestamp(u.lastSignedIn) },
    ],
    prompt: "  Act as which owner? (⏎ to quit)",
  });
}

export async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    return 0;
  }

  if (!process.env.DATABASE_URL) {
    console.error(
      "DATABASE_URL is not set. Run this on the server (deploy/admin.sh does), " +
        "or point it at a database first.",
    );
    return 1;
  }
  if (!(await getDb())) {
    console.error("Could not connect to the database. Is it running?");
    return 1;
  }

  const io = createReadlineIo();
  try {
    const operators = await listPlatformOperators();
    const operator = await resolveOperator(io, operators, args.as);
    if (!operator) return 1;

    const session = new ShellSession({
      io,
      operator,
      readOnly: args.readOnly,
      deps: defaultSessionDeps(operator),
    });

    if (args.store) {
      const tenant = await getTenantBySlug(args.store);
      if (tenant) session.setStore(tenant);
      else io.print(`  No store with slug "${args.store}".`);
    }

    io.print("");
    io.print("  Zolto administration shell");
    io.print(
      `  Acting as ${orDash(operator.email)}${args.readOnly ? " — READ-ONLY" : ""}.`,
    );
    io.print(
      "  Every write here goes through the same checks (and leaves the same audit",
    );
    io.print("  trail) as the web console.");

    await runShell({ session, root: menu });
    return 0;
  } catch (error) {
    if (error instanceof ShellExit) return 0;
    if (error instanceof NotAnOperatorError) {
      console.error(error.message);
      return 1;
    }
    throw error;
  } finally {
    io.close();
  }
}

/**
 * Only start a session when this file IS the program — importing it (the tests
 * do, to exercise argument parsing and operator selection) must not open a
 * prompt on somebody's terminal.
 */
const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main()
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
