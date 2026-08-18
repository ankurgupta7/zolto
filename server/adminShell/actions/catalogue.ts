/**
 * Tier — Catalogue: a store's products and its category vocabulary.
 *
 * All of it runs through the same procedures the admin screens call, so stock
 * that reaches zero still flips to sold, a category rename still cascades to
 * every product in it, and a duplicate merge still deletes the images first.
 */

import { askInteger, chooseFrom } from "../choose";
import { heading, orDash, table, timestamp, truncate, yesNo } from "../format";
import type { ActionContext, StoreScope } from "../types";
import { confirmWrite, withStore } from "./helpers";

type ProductRow = Awaited<
  ReturnType<StoreScope["caller"]["products"]["adminList"]>
>[number];

function productColumns() {
  return [
    {
      label: "id",
      align: "right" as const,
      value: (p: ProductRow) => String(p.id),
    },
    { label: "name", value: (p: ProductRow) => truncate(p.name, 40) },
    {
      label: "price",
      align: "right" as const,
      value: (p: ProductRow) => p.price,
    },
    { label: "category", value: (p: ProductRow) => p.category },
    {
      label: "qty",
      align: "right" as const,
      value: (p: ProductRow) => String(p.quantity),
    },
    { label: "visible", value: (p: ProductRow) => yesNo(p.visible) },
    { label: "sold", value: (p: ProductRow) => yesNo(p.sold) },
  ];
}

async function pickProduct(
  ctx: ActionContext,
  scope: StoreScope,
  title: string,
): Promise<ProductRow | null> {
  const products = await scope.caller.products.adminList();
  return chooseFrom(ctx.io, {
    title: `  ${title}`,
    rows: products,
    empty: "This store has no products.",
    searchable: (p) => [String(p.id), p.name],
    columns: productColumns(),
    prompt: "  Which product? (number, id or name — ⏎ to cancel)",
  });
}

export async function listProducts(ctx: ActionContext): Promise<void> {
  await withStore(ctx, async ({ tenant, caller }) => {
    const products = await caller.products.adminList();
    ctx.io.printLines(
      heading(`Catalogue — ${tenant.slug} (${products.length} products)`),
    );
    if (products.length === 0) {
      ctx.io.print("  Nothing in this catalogue yet.");
      return;
    }
    ctx.io.printLines(
      table(products, [
        ...productColumns(),
        { label: "photo", value: (p) => yesNo(p.imageUrl) },
        { label: "added", value: (p) => timestamp(p.createdAt) },
      ]),
    );
    const live = products.filter((p) => p.visible && !p.sold).length;
    ctx.io.print("");
    ctx.io.print(
      `  ${live} live · ${products.filter((p) => p.sold).length} sold · ` +
        `${products.filter((p) => !p.visible).length} hidden · ` +
        `${products.filter((p) => !p.imageUrl).length} without a photo`,
    );
  });
}

export async function toggleVisibility(ctx: ActionContext): Promise<void> {
  await withStore(ctx, async (scope) => {
    const product = await pickProduct(
      ctx,
      scope,
      "Show or hide which product?",
    );
    if (!product) return;
    const next = !product.visible;
    if (
      !(await confirmWrite(
        ctx,
        `${next ? "Show" : "Hide"} "${product.name}" on the storefront?`,
      ))
    ) {
      return;
    }
    await scope.caller.products.toggleVisibility({
      id: product.id,
      visible: next,
    });
    ctx.io.print(`  "${product.name}" is now ${next ? "visible" : "hidden"}.`);
  });
}

export async function toggleSold(ctx: ActionContext): Promise<void> {
  await withStore(ctx, async (scope) => {
    const product = await pickProduct(ctx, scope, "Mark which product?");
    if (!product) return;
    const next = !product.sold;
    if (
      !(await confirmWrite(
        ctx,
        `Mark "${product.name}" as ${next ? "sold" : "available"}?`,
      ))
    ) {
      return;
    }
    await scope.caller.products.toggleSold({ id: product.id, sold: next });
    ctx.io.print(`  "${product.name}" is now ${next ? "sold" : "available"}.`);
  });
}

export async function setQuantity(ctx: ActionContext): Promise<void> {
  await withStore(ctx, async (scope) => {
    const product = await pickProduct(ctx, scope, "Restock which product?");
    if (!product) return;
    ctx.io.print(
      `  "${product.name}" currently has ${product.quantity} in stock.`,
    );
    const quantity = await askInteger(ctx.io, "  New quantity (⏎ to cancel)", {
      min: 0,
    });
    if (quantity === null) return;
    if (quantity === 0) {
      ctx.io.print("  Zero stock also marks the piece sold.");
    }
    if (
      !(await confirmWrite(
        ctx,
        `Set "${product.name}" to ${quantity} in stock?`,
      ))
    ) {
      return;
    }
    await scope.caller.products.setQuantity({ id: product.id, quantity });
    ctx.io.print(`  "${product.name}" is now at ${quantity}.`);
  });
}

export async function deleteProduct(ctx: ActionContext): Promise<void> {
  await withStore(ctx, async (scope) => {
    const product = await pickProduct(ctx, scope, "Delete which product?");
    if (!product) return;
    ctx.io.print(
      "  This is a hard delete. Hiding it instead keeps its order history readable.",
    );
    if (
      !(await confirmWrite(
        ctx,
        `Permanently delete "${product.name}" (id ${product.id})?`,
      ))
    ) {
      return;
    }
    await scope.caller.products.delete({ id: product.id });
    ctx.io.print(`  Deleted "${product.name}".`);
  });
}

/**
 * The duplicate report, and the same cleanup the admin dialog performs: keep
 * the most complete row of each group, delete the rest — but only after the
 * operator has seen exactly which ids go.
 */
export async function findDuplicates(ctx: ActionContext): Promise<void> {
  await withStore(ctx, async ({ tenant, caller }) => {
    const groups = await caller.products.findDuplicates();
    ctx.io.printLines(
      heading(`Duplicate names — ${tenant.slug} (${groups.length} groups)`),
    );
    if (groups.length === 0) {
      ctx.io.print("  No two products share a name. Nothing to clean up.");
      return;
    }

    const doomed: number[] = [];
    for (const group of groups) {
      ctx.io.print("");
      ctx.io.print(`  "${group.key}" — ${group.products.length} rows`);
      ctx.io.printLines(
        table(group.products, [
          {
            label: "id",
            align: "right",
            value: (p) =>
              `${p.id}${p.id === group.suggestedKeepId ? " ←keep" : ""}`,
          },
          { label: "price", align: "right", value: (p) => p.price },
          { label: "qty", align: "right", value: (p) => String(p.quantity) },
          { label: "visible", value: (p) => yesNo(p.visible) },
          { label: "sold", value: (p) => yesNo(p.sold) },
          { label: "photo", value: (p) => yesNo(p.imageUrl) },
          { label: "added", value: (p) => timestamp(p.createdAt) },
        ]),
      );
      doomed.push(
        ...group.products
          .filter((p) => p.id !== group.suggestedKeepId)
          .map((p) => p.id),
      );
    }

    if (doomed.length === 0) return;
    ctx.io.print("");
    ctx.io.print(
      `  Keeping the suggested row in each group would delete ${doomed.length} products: ${doomed.join(", ")}`,
    );
    if (
      !(await confirmWrite(
        ctx,
        `Delete those ${doomed.length} duplicate rows (and their images)?`,
      ))
    ) {
      return;
    }
    const result = await caller.products.mergeDuplicates({ ids: doomed });
    ctx.io.print(`  Removed ${result.removed} duplicate products.`);
  });
}

// ─── Categories ───────────────────────────────────────────────────────────────

export async function listCategories(ctx: ActionContext): Promise<void> {
  await withStore(ctx, async ({ tenant, caller }) => {
    const categories = await caller.categories.list();
    ctx.io.printLines(
      heading(`Categories — ${tenant.slug} (${categories.length})`),
    );
    if (categories.length === 0) {
      ctx.io.print("  This store has no categories.");
      return;
    }
    ctx.io.printLines(
      table(categories, [
        { label: "order", align: "right", value: (c) => String(c.sortOrder) },
        { label: "key", value: (c) => c.key },
        { label: "EN", value: (c) => orDash(c.labelEn) },
        { label: "DE", value: (c) => orDash(c.labelDe) },
        { label: "FR", value: (c) => orDash(c.labelFr) },
        { label: "IT", value: (c) => orDash(c.labelIt) },
      ]),
    );
  });
}

export async function addCategory(ctx: ActionContext): Promise<void> {
  await withStore(ctx, async ({ tenant, caller }) => {
    const key = await ctx.io.ask("  Category key (⏎ to cancel)");
    if (key === "") return;
    const labelEn = await ctx.io.ask("  English label", { default: key });
    const labelDe = await ctx.io.ask("  German label (⏎ to skip)");
    const labelFr = await ctx.io.ask("  French label (⏎ to skip)");
    const labelIt = await ctx.io.ask("  Italian label (⏎ to skip)");
    if (
      !(await confirmWrite(ctx, `Add category "${key}" to ${tenant.slug}?`))
    ) {
      return;
    }
    await caller.categories.create({
      key,
      labelEn,
      ...(labelDe ? { labelDe } : {}),
      ...(labelFr ? { labelFr } : {}),
      ...(labelIt ? { labelIt } : {}),
    });
    ctx.io.print(`  Added "${key}".`);
  });
}

export async function renameCategory(ctx: ActionContext): Promise<void> {
  await withStore(ctx, async ({ tenant, caller }) => {
    const categories = await caller.categories.list();
    const category = await chooseFrom(ctx.io, {
      title: `  Categories on ${tenant.slug}`,
      rows: categories,
      empty: "This store has no categories.",
      searchable: (c) => [c.key, c.labelEn ?? ""],
      columns: [
        { label: "key", value: (c) => c.key },
        { label: "EN", value: (c) => orDash(c.labelEn) },
      ],
    });
    if (!category) return;

    const newKey = await ctx.io.ask("  New key (⏎ to keep it)", {
      default: category.key,
    });
    const labelEn = await ctx.io.ask("  English label", {
      default: category.labelEn ?? category.key,
    });
    if (newKey !== category.key) {
      ctx.io.print(
        "  Renaming the key moves every product in this category with it, in one transaction.",
      );
    }
    if (!(await confirmWrite(ctx, `Rename "${category.key}" → "${newKey}"?`))) {
      return;
    }
    await caller.categories.update({
      key: category.key,
      ...(newKey !== category.key ? { newKey } : {}),
      labelEn,
    });
    ctx.io.print(`  Updated "${newKey}".`);
  });
}

export async function deleteCategory(ctx: ActionContext): Promise<void> {
  await withStore(ctx, async ({ tenant, caller }) => {
    const categories = await caller.categories.list();
    const category = await chooseFrom(ctx.io, {
      title: `  Categories on ${tenant.slug}`,
      rows: categories,
      empty: "This store has no categories.",
      searchable: (c) => [c.key, c.labelEn ?? ""],
      columns: [
        { label: "key", value: (c) => c.key },
        { label: "EN", value: (c) => orDash(c.labelEn) },
      ],
    });
    if (!category) return;

    const others = categories.filter((c) => c.key !== category.key);
    const reassignTo = await chooseFrom(ctx.io, {
      title: "  Move any products in it to",
      rows: others,
      empty:
        "There is nowhere to move its products — add another category first.",
      searchable: (c) => [c.key],
      columns: [
        { label: "key", value: (c) => c.key },
        { label: "EN", value: (c) => orDash(c.labelEn) },
      ],
    });
    if (!reassignTo) return;

    if (
      !(await confirmWrite(
        ctx,
        `Delete "${category.key}", moving its products to "${reassignTo.key}"?`,
      ))
    ) {
      return;
    }
    const result = await caller.categories.remove({
      key: category.key,
      reassignTo: reassignTo.key,
    });
    ctx.io.print(
      `  Deleted "${category.key}"; ${result.reassigned} product(s) moved to "${reassignTo.key}".`,
    );
  });
}

export async function reorderCategories(ctx: ActionContext): Promise<void> {
  await withStore(ctx, async ({ tenant, caller }) => {
    const categories = await caller.categories.list();
    if (categories.length === 0) {
      ctx.io.print("  This store has no categories.");
      return;
    }
    ctx.io.printLines(
      table(categories, [
        {
          label: "#",
          align: "right",
          value: (c) => String(categories.indexOf(c) + 1),
        },
        { label: "key", value: (c) => c.key },
      ]),
    );
    const answer = await ctx.io.ask(
      "  New order as numbers, e.g. 3,1,2 (⏎ to cancel)",
    );
    if (answer === "") return;

    const positions = answer
      .split(/[\s,]+/)
      .filter(Boolean)
      .map((n) => Number.parseInt(n, 10));
    const valid =
      positions.length === categories.length &&
      positions.every((n) => n >= 1 && n <= categories.length) &&
      new Set(positions).size === positions.length;
    if (!valid) {
      ctx.io.print(
        `  That isn't a permutation of 1–${categories.length}. Nothing changed.`,
      );
      return;
    }

    const keys = positions.map((n) => categories[n - 1].key);
    if (!(await confirmWrite(ctx, `Reorder to: ${keys.join(", ")}?`))) return;
    await caller.categories.reorder({ keys });
    ctx.io.print(`  Reordered ${tenant.slug}'s categories.`);
  });
}

/**
 * Re-apply the store's vertical preset. Additive only — it never removes or
 * renames what the merchant has already got, which is what makes it safe to
 * run after changing the store's vertical in settings.
 */
export async function applyCategoryPreset(ctx: ActionContext): Promise<void> {
  await withStore(ctx, async ({ tenant, caller }) => {
    if (
      !(await confirmWrite(
        ctx,
        `Add any missing preset categories to ${tenant.slug}? (nothing is removed)`,
      ))
    ) {
      return;
    }
    const result = await caller.categories.applyPreset();
    ctx.io.print(
      `  Applied the "${result.vertical}" preset: ${result.preset.join(", ")}`,
    );
  });
}
