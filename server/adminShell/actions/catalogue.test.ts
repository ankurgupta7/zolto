import { describe, expect, it, vi } from "vitest";
import { createFakeContext } from "../fakeContext";
import {
  addCategory,
  applyCategoryPreset,
  deleteCategory,
  deleteProduct,
  findDuplicates,
  listCategories,
  listProducts,
  renameCategory,
  reorderCategories,
  setQuantity,
  toggleSold,
  toggleVisibility,
} from "./catalogue";

const product = (over: Record<string, unknown> = {}) => ({
  id: 1,
  name: "Silver ring",
  price: "120.00",
  category: "rings",
  quantity: 2,
  visible: true,
  sold: false,
  imageUrl: "https://example.com/a.jpg",
  createdAt: new Date("2026-02-01T10:00:00Z"),
  ...over,
});

const categories = [
  {
    key: "rings",
    labelEn: "Rings",
    labelDe: null,
    labelFr: null,
    labelIt: null,
    extraIncludes: [],
    sortOrder: 0,
  },
  {
    key: "other",
    labelEn: "Other",
    labelDe: null,
    labelFr: null,
    labelIt: null,
    extraIncludes: [],
    sortOrder: 1,
  },
];

describe("listProducts", () => {
  it("lists everything, hidden rows included, and tallies the state of the catalogue", async () => {
    const { ctx, fake } = createFakeContext({
      caller: {
        products: {
          adminList: async () => [
            product(),
            product({ id: 2, visible: false, sold: true, imageUrl: null }),
          ],
        },
      },
    });

    await listProducts(ctx);
    expect(fake.text()).toContain("2 products");
    expect(fake.text()).toContain(
      "1 live · 1 sold · 1 hidden · 1 without a photo",
    );
  });

  it("says so for an empty catalogue", async () => {
    const { ctx, fake } = createFakeContext({
      caller: { products: { adminList: async () => [] } },
    });
    await listProducts(ctx);
    expect(fake.text()).toContain("Nothing in this catalogue yet.");
  });
});

describe("toggles", () => {
  it("hides a visible product", async () => {
    const toggle = vi.fn(async () => ({ success: true }));
    const { ctx } = createFakeContext({
      answers: ["1", "y"],
      caller: {
        products: {
          adminList: async () => [product()],
          toggleVisibility: toggle,
        },
      },
    });

    await toggleVisibility(ctx);
    expect(toggle).toHaveBeenCalledWith({ id: 1, visible: false });
  });

  it("marks an available product sold", async () => {
    const toggle = vi.fn(async () => ({ success: true }));
    const { ctx } = createFakeContext({
      answers: ["1", "y"],
      caller: {
        products: { adminList: async () => [product()], toggleSold: toggle },
      },
    });

    await toggleSold(ctx);
    expect(toggle).toHaveBeenCalledWith({ id: 1, sold: true });
  });
});

describe("setQuantity", () => {
  it("restocks a piece", async () => {
    const set = vi.fn(async () => ({ success: true }));
    const { ctx } = createFakeContext({
      answers: ["1", "9", "y"],
      caller: {
        products: { adminList: async () => [product()], setQuantity: set },
      },
    });

    await setQuantity(ctx);
    expect(set).toHaveBeenCalledWith({ id: 1, quantity: 9 });
  });

  it("says that zero also marks the piece sold", async () => {
    const set = vi.fn(async () => ({ success: true }));
    const { ctx, fake } = createFakeContext({
      answers: ["1", "0", "y"],
      caller: {
        products: { adminList: async () => [product()], setQuantity: set },
      },
    });

    await setQuantity(ctx);
    expect(fake.text()).toContain("Zero stock also marks the piece sold.");
    expect(set).toHaveBeenCalledWith({ id: 1, quantity: 0 });
  });
});

describe("deleteProduct", () => {
  it("warns that hiding preserves order history, and deletes on confirmation", async () => {
    const del = vi.fn(async () => ({ success: true }));
    const { ctx, fake } = createFakeContext({
      answers: ["1", "y"],
      caller: { products: { adminList: async () => [product()], delete: del } },
    });

    await deleteProduct(ctx);
    expect(fake.text()).toContain("hard delete");
    expect(del).toHaveBeenCalledWith({ id: 1 });
  });

  it("deletes nothing when the confirmation is declined", async () => {
    const del = vi.fn();
    const { ctx } = createFakeContext({
      answers: ["1", ""],
      caller: { products: { adminList: async () => [product()], delete: del } },
    });

    await deleteProduct(ctx);
    expect(del).not.toHaveBeenCalled();
  });
});

describe("findDuplicates", () => {
  const groups = [
    {
      key: "silver ring",
      suggestedKeepId: 2,
      products: [product({ id: 1 }), product({ id: 2 })],
    },
  ];

  it("names exactly which ids would go before asking", async () => {
    const merge = vi.fn(async () => ({ removed: 1 }));
    const { ctx, fake } = createFakeContext({
      answers: ["y"],
      caller: {
        products: {
          findDuplicates: async () => groups,
          mergeDuplicates: merge,
        },
      },
    });

    await findDuplicates(ctx);
    expect(fake.text()).toContain("2 ←keep");
    expect(fake.text()).toContain("would delete 1 products: 1");
    expect(merge).toHaveBeenCalledWith({ ids: [1] });
  });

  it("reports a clean catalogue without asking anything", async () => {
    const merge = vi.fn();
    const { ctx, fake } = createFakeContext({
      caller: {
        products: { findDuplicates: async () => [], mergeDuplicates: merge },
      },
    });

    await findDuplicates(ctx);
    expect(fake.text()).toContain("No two products share a name.");
    expect(merge).not.toHaveBeenCalled();
  });
});

describe("categories", () => {
  it("lists them in display order", async () => {
    const { ctx, fake } = createFakeContext({
      caller: { categories: { list: async () => categories } },
    });
    await listCategories(ctx);
    expect(fake.text()).toContain("Categories — kalakosh (2)");
  });

  it("adds one, sending only the labels that were filled in", async () => {
    const create = vi.fn(async () => ({ success: true }));
    const { ctx } = createFakeContext({
      answers: ["earrings", "Earrings", "Ohrringe", "", "", "y"],
      caller: { categories: { create } },
    });

    await addCategory(ctx);
    expect(create).toHaveBeenCalledWith({
      key: "earrings",
      labelEn: "Earrings",
      labelDe: "Ohrringe",
    });
  });

  it("warns that a key rename takes every product with it", async () => {
    const update = vi.fn(async () => ({ success: true }));
    const { ctx, fake } = createFakeContext({
      answers: ["1", "bands", "Bands", "y"],
      caller: { categories: { list: async () => categories, update } },
    });

    await renameCategory(ctx);
    expect(fake.text()).toContain("moves every product in this category");
    expect(update).toHaveBeenCalledWith({
      key: "rings",
      newKey: "bands",
      labelEn: "Bands",
    });
  });

  it("insists on somewhere for a deleted category's products to go", async () => {
    const remove = vi.fn(async () => ({ success: true, reassigned: 4 }));
    const { ctx, fake } = createFakeContext({
      answers: ["rings", "other", "y"],
      caller: { categories: { list: async () => categories, remove } },
    });

    await deleteCategory(ctx);
    expect(remove).toHaveBeenCalledWith({ key: "rings", reassignTo: "other" });
    expect(fake.text()).toContain("4 product(s) moved");
  });

  it("reorders on a permutation", async () => {
    const reorder = vi.fn(async () => ({ success: true }));
    const { ctx } = createFakeContext({
      answers: ["2,1", "y"],
      caller: { categories: { list: async () => categories, reorder } },
    });

    await reorderCategories(ctx);
    expect(reorder).toHaveBeenCalledWith({ keys: ["other", "rings"] });
  });

  it("refuses anything that is not a permutation, rather than dropping a category", async () => {
    const reorder = vi.fn();
    const { ctx, fake } = createFakeContext({
      answers: ["1,1"],
      caller: { categories: { list: async () => categories, reorder } },
    });

    await reorderCategories(ctx);
    expect(reorder).not.toHaveBeenCalled();
    expect(fake.text()).toContain("isn't a permutation of 1–2");
  });

  it("re-applies the preset additively", async () => {
    const applyPreset = vi.fn(async () => ({
      success: true,
      vertical: "jewellery",
      preset: ["rings", "necklaces"],
    }));
    const { ctx, fake } = createFakeContext({
      answers: ["y"],
      caller: { categories: { applyPreset } },
    });

    await applyCategoryPreset(ctx);
    expect(applyPreset).toHaveBeenCalled();
    expect(fake.text()).toContain('Applied the "jewellery" preset');
  });
});
