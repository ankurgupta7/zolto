import { describe, it, expect, vi, beforeEach } from "vitest";

const dbMock = vi.hoisted(() => ({
  getProductById: vi.fn(),
  updateProductTranslations: vi.fn(),
  getProductsMissingTranslation: vi.fn(),
}));

const llmMock = vi.hoisted(() => ({
  invokeLLM: vi.fn(),
}));

vi.mock("../db", () => dbMock);
vi.mock("../_core/llm", () => llmMock);

import { productsRouter } from "./products";
import type { TrpcContext } from "../_core/context";

const admin = {
  id: 1,
  openId: "google:a",
  role: "admin",
  tenantId: 42,
} as never;

function ctx(): TrpcContext {
  return {
    req: { headers: {} } as never,
    res: {} as never,
    user: admin,
    tenant: { id: 42, slug: "aurora", name: "Aurora", plan: "maker" },
  } as never;
}

const caller = productsRouter.createCaller(ctx());

function product(over: Record<string, unknown> = {}) {
  return {
    id: 7,
    tenantId: 42,
    name: "Silberring",
    description: "Handgefertigter Ring aus 925er Silber.",
    nameEn: null,
    descriptionEn: null,
    nameDe: null,
    descriptionDe: null,
    nameFr: null,
    descriptionFr: null,
    nameIt: null,
    descriptionIt: null,
    ...over,
  };
}

const LLM_OK = {
  choices: [
    {
      message: {
        content: JSON.stringify({
          locales: {
            en: {
              name: "Silver ring",
              description: "Handcrafted 925 silver ring.",
            },
            de: {
              name: "Silberring",
              description: "Handgefertigter 925er Silberring.",
            },
            fr: {
              name: "Bague en argent",
              description: "Bague artisanale en argent 925.",
            },
          },
        }),
      },
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.updateProductTranslations.mockResolvedValue(undefined);
  llmMock.invokeLLM.mockResolvedValue(LLM_OK);
  dbMock.getProductsMissingTranslation.mockResolvedValue([]);
});

describe("products.previewAutoTranslateAll", () => {
  it("returns no proposals when nothing is missing", async () => {
    const res = await caller.previewAutoTranslateAll();
    expect(res).toEqual({ proposals: [], total: 0 });
    expect(llmMock.invokeLLM).not.toHaveBeenCalled();
  });

  it("asks the model in the tenant's own store name, not another brand", async () => {
    dbMock.getProductsMissingTranslation.mockResolvedValue([
      {
        id: 7,
        name: "Silberring",
        description: "Handgefertigt",
        category: "Rings",
        nameEn: null,
        descriptionEn: null,
      },
    ]);
    llmMock.invokeLLM.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              items: [
                {
                  id: 7,
                  nameEn: "Silver ring",
                  descriptionEn: "Made by hand.",
                },
              ],
            }),
          },
        },
      ],
    });
    const res = await caller.previewAutoTranslateAll();
    expect(res.total).toBe(1);
    const system = llmMock.invokeLLM.mock.calls[0][0].messages[0]
      .content as string;
    expect(system).toContain('"Aurora"');
    expect(system).not.toContain("Kalakosh");
  });
});

describe("products.translateProductLocales", () => {
  it("translates all missing locales in one pass and persists the patch", async () => {
    dbMock.getProductById.mockResolvedValue(product());
    const res = await caller.translateProductLocales({ productId: 7 });
    expect(res).toEqual({ translated: ["en", "de", "fr"], skipped: false });
    expect(dbMock.updateProductTranslations).toHaveBeenCalledWith(42, 7, {
      nameEn: "Silver ring",
      descriptionEn: "Handcrafted 925 silver ring.",
      nameDe: "Silberring",
      descriptionDe: "Handgefertigter 925er Silberring.",
      nameFr: "Bague en argent",
      descriptionFr: "Bague artisanale en argent 925.",
    });
  });

  it("asks the model in the store's name, not a hardcoded brand", async () => {
    dbMock.getProductById.mockResolvedValue(product());
    await caller.translateProductLocales({ productId: 7 });
    const system = llmMock.invokeLLM.mock.calls[0][0].messages[0]
      .content as string;
    expect(system).toContain('"Aurora"');
    expect(system).not.toContain("Kalakosh");
  });

  it("skips when every locale is already filled", async () => {
    dbMock.getProductById.mockResolvedValue(
      product({
        nameEn: "Ring",
        descriptionEn: "A ring",
        nameDe: "Ring",
        descriptionDe: "Ein Ring",
        nameFr: "Bague",
        descriptionFr: "Une bague",
        nameIt: "Anello",
        descriptionIt: "Un anello",
      }),
    );
    const res = await caller.translateProductLocales({ productId: 7 });
    expect(res).toEqual({ translated: [], skipped: true });
    expect(llmMock.invokeLLM).not.toHaveBeenCalled();
    expect(dbMock.updateProductTranslations).not.toHaveBeenCalled();
  });

  it("only requests the missing locales", async () => {
    dbMock.getProductById.mockResolvedValue(
      product({ nameEn: "Ring", descriptionEn: "A ring" }),
    );
    await caller.translateProductLocales({ productId: 7 });
    const user = llmMock.invokeLLM.mock.calls[0][0].messages[1]
      .content as string;
    expect(JSON.parse(user).locales).toEqual(["de", "fr", "it"]);
  });

  it("re-translates everything when overwrite is set", async () => {
    dbMock.getProductById.mockResolvedValue(
      product({ nameEn: "Old", descriptionEn: "Old desc" }),
    );
    await caller.translateProductLocales({ productId: 7, overwrite: true });
    const user = llmMock.invokeLLM.mock.calls[0][0].messages[1]
      .content as string;
    expect(JSON.parse(user).locales).toEqual(["en", "de", "fr", "it"]);
  });

  it("throws NOT_FOUND for a missing product", async () => {
    dbMock.getProductById.mockResolvedValue(null);
    await expect(
      caller.translateProductLocales({ productId: 99 }),
    ).rejects.toThrow(/not found/i);
  });

  it("throws a friendly error on unreadable LLM output", async () => {
    dbMock.getProductById.mockResolvedValue(product());
    llmMock.invokeLLM.mockResolvedValue({
      choices: [{ message: { content: "not json at all" } }],
    });
    await expect(
      caller.translateProductLocales({ productId: 7 }),
    ).rejects.toThrow(/Translation failed/);
    expect(dbMock.updateProductTranslations).not.toHaveBeenCalled();
  });

  it("throws when the model returns no usable locales", async () => {
    dbMock.getProductById.mockResolvedValue(product());
    llmMock.invokeLLM.mockResolvedValue({
      choices: [{ message: { content: '{"locales":{}}' } }],
    });
    await expect(
      caller.translateProductLocales({ productId: 7 }),
    ).rejects.toThrow(/no usable output/);
  });
});
