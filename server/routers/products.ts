import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { PRODUCT_CATEGORIES, type ProductCategory } from "@shared/const";
import { publicProcedure, router } from "../_core/trpc";
import { adminProcedure } from "../procedures";
import { assertPublicHostname } from "../ssrf";
import { storagePut } from "../storage";
import {
  createProduct,
  updateProduct,
  deleteProduct,
  getAllProducts,
  getProductById,
  getVisibleProductById,
  getVisibleProducts,
  setProductVisibility,
  setProductSold,
  setProductQuantity,
  getProductImages,
  addProductImage,
  deleteProductImage,
  deleteAllProductImages,
  insertBulkUploadLog,
  getBulkUploadLogs,
  getProductsMissingTranslation,
  getPaidOrders,
} from "../db";

// ─── Products router ──────────────────────────────────────────────────────────

// Storefront reads are scoped to the tenant resolved from the request (host /
// X-Tenant-Slug). No tenant → no store, so return NOT_FOUND rather than leaking
// another tenant's catalogue.
function storefrontTenantId(ctx: { tenant: { id: number } | null }): number {
  if (!ctx.tenant) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });
  }
  return ctx.tenant.id;
}

export const productsRouter = router({
  // Public: list all visible products
  list: publicProcedure
    .input(
      z
        .object({
          category: z.enum(PRODUCT_CATEGORIES).optional(),
        })
        .optional()
    )
    .query(async ({ input, ctx }) => {
      const all = await getVisibleProducts(storefrontTenantId(ctx));
      if (input?.category) {
        return all.filter(p => p.category === input.category);
      }
      return all;
    }),

  // Public: get single visible product
  getById: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const product = await getVisibleProductById(
        storefrontTenantId(ctx),
        input.id
      );
      if (!product) throw new TRPCError({ code: "NOT_FOUND" });
      return product;
    }),

  // Admin: list all products (including hidden)
  adminList: adminProcedure.query(async ({ ctx }) => {
    return getAllProducts(ctx.user.tenantId);
  }),

  // Admin: preview groups of products sharing the same (normalized) name —
  // the fingerprint left by the CSV/Sheets re-import bug that used to create
  // a fresh duplicate row for every already-imported item.
  findDuplicates: adminProcedure.query(async ({ ctx }) => {
    const all = await getAllProducts(ctx.user.tenantId);
    const groups = new Map<string, typeof all>();
    for (const p of all) {
      const key = p.name.trim().toLowerCase();
      const list = groups.get(key) ?? [];
      list.push(p);
      groups.set(key, list);
    }

    const score = (p: (typeof all)[number]) =>
      (p.visible && !p.sold ? 2 : 0) +
      (p.quantity > 0 ? 1 : 0) +
      (p.imageUrl ? 1 : 0);

    return Array.from(groups.entries())
      .filter(([, items]) => items.length > 1)
      .map(([key, items]) => {
        // Suggest keeping the most complete/current-looking row (visible,
        // in-stock, photographed); break ties by newest id.
        const suggested = [...items].sort((a, b) => {
          const diff = score(b) - score(a);
          return diff !== 0 ? diff : b.id - a.id;
        })[0];
        return { key, suggestedKeepId: suggested.id, products: items };
      });
  }),

  // Admin: permanently delete exactly the product ids the admin reviewed and
  // approved in the duplicate-cleanup dialog. Takes explicit ids (rather
  // than re-deriving group membership server-side) so the confirmation UI
  // can let the admin deselect any single row before anything is written.
  // This is a hard delete, not a visibility toggle — it's irreversible.
  mergeDuplicates: adminProcedure
    .input(z.object({ ids: z.array(z.number()).min(1) }))
    .mutation(async ({ input, ctx }) => {
      const tid = ctx.user.tenantId;
      const all = await getAllProducts(tid);
      const existingIds = new Set(all.map(p => p.id));
      let removed = 0;
      for (const id of input.ids) {
        if (!existingIds.has(id)) continue; // already removed, or never existed
        await deleteAllProductImages(tid, id);
        await deleteProduct(tid, id);
        removed++;
      }
      return { removed };
    }),

  // Admin: toggle visibility
  toggleVisibility: adminProcedure
    .input(z.object({ id: z.number(), visible: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      await setProductVisibility(ctx.user.tenantId, input.id, input.visible);
      return { success: true };
    }),

  // Admin: toggle sold status
  toggleSold: adminProcedure
    .input(z.object({ id: z.number(), sold: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      await setProductSold(ctx.user.tenantId, input.id, input.sold);
      return { success: true };
    }),

  // Admin: set stock quantity (also flips sold when quantity reaches 0)
  setQuantity: adminProcedure
    .input(z.object({ id: z.number(), quantity: z.number().int().min(0) }))
    .mutation(async ({ input, ctx }) => {
      await setProductQuantity(ctx.user.tenantId, input.id, input.quantity);
      return { success: true };
    }),

  // Admin: delete product
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await deleteProduct(ctx.user.tenantId, input.id);
      return { success: true };
    }),

  // Public: get images for a product
  getImages: publicProcedure
    .input(z.object({ productId: z.number() }))
    .query(async ({ input, ctx }) => {
      return getProductImages(storefrontTenantId(ctx), input.productId);
    }),

  // Admin: add an image to a product (base64 upload)
  addImage: adminProcedure
    .input(
      z.object({
        productId: z.number(),
        imageData: z.string(), // base64 data URL
        mimeType: z.string().default("image/jpeg"),
        sortOrder: z.number().default(0),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const tid = ctx.user.tenantId;
      // Reject an image upload aimed at another tenant's product.
      const target = await getProductById(tid, input.productId);
      if (!target) throw new TRPCError({ code: "NOT_FOUND" });
      // Strip data URL prefix if present
      const base64 = input.imageData.replace(/^data:[^;]+;base64,/, "");
      const buffer = Buffer.from(base64, "base64");
      const ext = input.mimeType.split("/")[1] ?? "jpg";
      const key = `product-images/${input.productId}/${Date.now()}.${ext}`;
      const { url } = await storagePut(key, buffer, input.mimeType);
      await addProductImage({
        tenantId: tid,
        productId: input.productId,
        imageKey: key,
        imageUrl: url,
        sortOrder: input.sortOrder,
      });
      // If product has no primary image yet, promote this one so it appears in the shop
      if (!target.imageUrl) {
        await updateProduct(tid, input.productId, {
          imageKey: key,
          imageUrl: url,
        });
      }
      return { success: true, url };
    }),

  // Admin: delete a specific product image
  deleteImage: adminProcedure
    .input(z.object({ imageId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await deleteProductImage(ctx.user.tenantId, input.imageId);
      return { success: true };
    }),

  // Admin: analyze a group of images with AI and return product suggestions
  bulkAnalyze: adminProcedure
    .input(
      z.object({
        groups: z
          .array(
            z.object({
              groupId: z.string(),
              images: z
                .array(
                  z.object({
                    data: z.string(), // base64 data URL
                    mimeType: z.string().default("image/jpeg"),
                  })
                )
                .min(1)
                .max(8),
            })
          )
          .min(1)
          .max(20),
      })
    )
    .mutation(async ({ input }) => {
      const { invokeLLM } = await import("../_core/llm");
      const results = await Promise.all(
        input.groups.map(async group => {
          try {
            // Build multimodal message: all images in the group + instruction
            const imageContents = group.images.map(img => ({
              type: "image_url" as const,
              image_url: { url: img.data, detail: "auto" as const },
            }));

            const response = await invokeLLM({
              messages: [
                {
                  role: "system",
                  content: `You are a product copywriter for Kalakosh Jewellery – Zürich, a luxury jewellery boutique in Zurich, Switzerland.
Analyse the provided photo(s) of a jewellery piece and return a JSON object with bilingual product details (German + English).

Available categories (keep these in English exactly as shown): ${PRODUCT_CATEGORIES.map(c => `"${c}"`).join(", ")}

Rules:
- name: short elegant product name in Swiss German (2–5 words). Use "ss" instead of "ß". Name the specific stone or pearl type first, e.g. "Mondstein-Ohrhänger", "Labradorit-Armband", "Barockperlen-Kollier".
- name_en: same product name in English (2–5 words), e.g. "Moonstone Drop Earrings", "Labradorite Cuff Bracelet", "Baroque Pearl Necklace".
- description: EXACTLY ONE sentence in Swiss German (use "ss" not "ß"). Name the specific stone/pearl variety and material. Make it poetic and sensory — evoke colour, lustre, texture, and feeling. e.g. "Tief-violette Amethyst-Cabochons schimmern in einem handgefertigten Sterlingsilber-Rahmen – eleganz, die den Blick anzieht."
- description_en: EXACTLY ONE sentence in English. Same jewel specificity and lyrical tone. e.g. "Deep-violet amethyst cabochons shimmer in a hand-wrought sterling-silver setting — elegance that draws every eye."
- category: must be exactly one of the body-part-based English values; infer from what you see:
  * Necklaces → necklaces, pendants, chokers, lariats, collar pieces
  * Earrings → studs, drop earrings, hoops, chandeliers, ear cuffs
  * Rings → finger rings of any style
  * Bracelets → chain bracelets, cuffs, charm bracelets, flexible wrist pieces
  * Bangles → rigid circular bangles worn on the wrist
  * Anklets → ankle chains, payal, ankle bracelets
  * Brooches → pins, brooches, lapel jewellery, decorative clips
  * Hair Accessories → hair pins, maang tikka, juda pins, hair combs, tiaras
  * Other → body chains, sets, or any piece that does not fit the above

Return ONLY valid JSON, no markdown, no explanation.`,
                },
                {
                  role: "user",
                  content: [
                    ...imageContents,
                    {
                      type: "text" as const,
                      text: "Please analyse this jewellery piece and extract the bilingual product details.",
                    },
                  ],
                },
              ],
              response_format: {
                type: "json_schema",
                json_schema: {
                  name: "jewelry_product",
                  strict: true,
                  schema: {
                    type: "object",
                    properties: {
                      name: {
                        type: "string",
                        description:
                          "Short elegant product name in Swiss German (2-5 words)",
                      },
                      name_en: {
                        type: "string",
                        description:
                          "Short elegant product name in English (2-5 words)",
                      },
                      description: {
                        type: "string",
                        description:
                          "One lyrical sentence in Swiss German naming the specific stone/pearl",
                      },
                      description_en: {
                        type: "string",
                        description:
                          "One lyrical sentence in English naming the specific stone/pearl",
                      },
                      category: {
                        type: "string",
                        enum: [...PRODUCT_CATEGORIES],
                        description: "Body-part-based product category",
                      },
                    },
                    required: [
                      "name",
                      "name_en",
                      "description",
                      "description_en",
                      "category",
                    ],
                    additionalProperties: false,
                  },
                },
              },
            });

            const rawContent = response.choices?.[0]?.message?.content;
            if (!rawContent) throw new Error("No content from LLM");
            const content =
              typeof rawContent === "string"
                ? rawContent
                : JSON.stringify(rawContent);
            const parsed = JSON.parse(content);

            return {
              groupId: group.groupId,
              success: true as const,
              name: parsed.name as string,
              nameEn: parsed.name_en as string,
              description: parsed.description as string,
              descriptionEn: parsed.description_en as string,
              category: parsed.category as ProductCategory,
            };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`[BulkAnalyze] Group ${group.groupId} failed:`, err);
            await insertBulkUploadLog({
              operation: "analyze",
              ref: group.groupId,
              errorMessage: msg,
            });
            return {
              groupId: group.groupId,
              success: false as const,
              name: "Schmueckstück",
              nameEn: "Jewelry Piece",
              description: "Handgefertigtes Schmueckstück.",
              descriptionEn: "Handcrafted jewelry piece.",
              category: "Other" as const,
            };
          }
        })
      );
      return results;
    }),

  // Admin: bulk create products with images (S3 upload per image)
  bulkCreate: adminProcedure
    .input(
      z.object({
        products: z
          .array(
            z.object({
              name: z.string().min(1),
              nameEn: z.string().optional(),
              description: z.string().min(1),
              descriptionEn: z.string().optional(),
              price: z.number().positive(),
              category: z.enum(PRODUCT_CATEGORIES),
              images: z
                .array(
                  z.object({
                    data: z.string(), // base64 data URL
                    mimeType: z.string().default("image/jpeg"),
                  })
                )
                .min(1)
                .max(8),
            })
          )
          .min(1)
          .max(20),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const tid = ctx.user.tenantId;
      const created: number[] = [];
      const failed: string[] = [];
      const extraImageWarnings: string[] = [];

      for (const item of input.products) {
        let newId: number | undefined;
        try {
          // Upload primary image (first in array)
          const primary = item.images[0];
          const primaryBase64 = primary.data.replace(
            /^data:[^;]+;base64,/,
            ""
          );
          const primaryBuffer = Buffer.from(primaryBase64, "base64");
          const primaryExt =
            primary.mimeType.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
          const primaryKey = `products/${Date.now()}-${Math.random().toString(36).slice(2)}.${primaryExt}`;
          const { url: primaryUrl } = await storagePut(
            primaryKey,
            primaryBuffer,
            primary.mimeType
          );

          // Create the product row
          const result = await createProduct({
            tenantId: tid,
            name: item.name,
            nameEn: item.nameEn ?? null,
            description: item.description,
            descriptionEn: item.descriptionEn ?? null,
            price: String(item.price),
            category: item.category,
            imageKey: primaryKey,
            imageUrl: primaryUrl,
            visible: true,
            source: "manual",
          });

          newId = (result as { insertId?: number }).insertId;
          if (!newId) throw new Error("No insertId returned");
          created.push(newId);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(
            `[BulkCreate] Failed to create "${item.name}":`,
            err
          );
          await insertBulkUploadLog({
            tenantId: tid,
            operation: "create",
            ref: item.name,
            errorMessage: msg,
          });
          failed.push(item.name);
          continue; // skip extra images for this item
        }

        // Upload additional images (2nd onwards) — non-fatal: product is already saved
        for (let i = 1; i < item.images.length; i++) {
          try {
            const img = item.images[i];
            const base64 = img.data.replace(/^data:[^;]+;base64,/, "");
            const buffer = Buffer.from(base64, "base64");
            const ext =
              img.mimeType.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
            const key = `product-images/${newId}/${Date.now()}-${i}.${ext}`;
            const { url } = await storagePut(key, buffer, img.mimeType);
            await addProductImage({
              tenantId: tid,
              productId: newId,
              imageKey: key,
              imageUrl: url,
              sortOrder: i,
            });
          } catch (imgErr) {
            const msg =
              imgErr instanceof Error ? imgErr.message : String(imgErr);
            console.error(
              `[BulkCreate] Extra image ${i} for "${item.name}" failed:`,
              imgErr
            );
            await insertBulkUploadLog({
              tenantId: tid,
              operation: "extra_image",
              ref: `${item.name} (image ${i + 1})`,
              errorMessage: msg,
            });
            extraImageWarnings.push(`${item.name} (image ${i + 1})`);
          }
        }
      }

      return { created: created.length, failed, extraImageWarnings };
    }),

  // Admin: find existing products that match the given names (normalised).
  // Used by bulk upload to suggest adding images to existing inventory instead of creating duplicates.
  findMatches: adminProcedure
    .input(
      z.object({
        items: z
          .array(
            z.object({
              tempId: z.string(),
              name: z.string().min(1),
              description: z.string().min(1),
              category: z.enum(PRODUCT_CATEGORIES),
            })
          )
          .min(1)
          .max(20),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const existing = await getAllProducts(ctx.user.tenantId);
      const byName = new Map(
        existing.map(p => [p.name.trim().toLowerCase(), p])
      );

      const matches = input.items.map(item => {
        const normalizedName = item.name.trim().toLowerCase();
        const exactMatch = byName.get(normalizedName);
        if (exactMatch) {
          return {
            tempId: item.tempId,
            matchedProductId: exactMatch.id,
            matchedProductName: exactMatch.name,
            confidence: "exact" as const,
          };
        }
        // Partial match: existing name contains query or vice-versa
        for (const [existingName, product] of Array.from(byName.entries())) {
          if (
            existingName.includes(normalizedName) ||
            normalizedName.includes(existingName)
          ) {
            return {
              tempId: item.tempId,
              matchedProductId: product.id,
              matchedProductName: product.name,
              confidence: "partial" as const,
            };
          }
        }
        return {
          tempId: item.tempId,
          matchedProductId: null,
          matchedProductName: null,
          confidence: "none" as const,
        };
      });

      return { matches };
    }),

  // Admin: add images to existing products (used when bulk upload matches existing inventory).
  // Optionally updates description if the AI extracted a new one.
  bulkUpsertImages: adminProcedure
    .input(
      z.object({
        items: z
          .array(
            z.object({
              productId: z.number(),
              images: z
                .array(
                  z.object({
                    data: z.string(), // base64 data URL
                    mimeType: z.string().default("image/jpeg"),
                  })
                )
                .min(1)
                .max(8),
              description: z.string().optional(),
              descriptionEn: z.string().optional(),
              updateDescription: z.boolean().default(false),
            })
          )
          .min(1)
          .max(20),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const tid = ctx.user.tenantId;
      const updated: number[] = [];
      const failed: string[] = [];
      const extraImageWarnings: string[] = [];

      for (const item of input.items) {
        try {
          // Verify product exists and belongs to this tenant
          const product = await getProductById(tid, item.productId);
          if (!product) {
            throw new Error(`Product ${item.productId} not found`);
          }

          // Update description if requested
          if (item.updateDescription && item.description) {
            const patch: Record<string, unknown> = {
              description: item.description,
            };
            if (item.descriptionEn) patch.descriptionEn = item.descriptionEn;
            await updateProduct(
              tid,
              item.productId,
              patch as Parameters<typeof updateProduct>[2]
            );
          }

          // Upload all images
          let primarySet = false;
          for (let i = 0; i < item.images.length; i++) {
            try {
              const img = item.images[i];
              const base64 = img.data.replace(/^data:[^;]+;base64,/, "");
              const buffer = Buffer.from(base64, "base64");
              const ext =
                img.mimeType.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
              const key = `product-images/${item.productId}/${Date.now()}-${i}.${ext}`;
              const { url } = await storagePut(key, buffer, img.mimeType);
              await addProductImage({
                tenantId: tid,
                productId: item.productId,
                imageKey: key,
                imageUrl: url,
                sortOrder: i,
              });

              // If product has no primary image yet, promote the first uploaded one
              if (!primarySet && !product.imageUrl) {
                await updateProduct(tid, item.productId, {
                  imageKey: key,
                  imageUrl: url,
                });
                primarySet = true;
              }
            } catch (imgErr) {
              const msg =
                imgErr instanceof Error ? imgErr.message : String(imgErr);
              console.error(
                `[BulkUpsertImages] Image ${i} for product ${item.productId} failed:`,
                imgErr
              );
              await insertBulkUploadLog({
                tenantId: tid,
                operation: "extra_image",
                ref: `Product ${item.productId} (image ${i + 1})`,
                errorMessage: msg,
              });
              extraImageWarnings.push(
                `Product ${item.productId} (image ${i + 1})`
              );
            }
          }

          updated.push(item.productId);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(
            `[BulkUpsertImages] Failed for product ${item.productId}:`
          );
          await insertBulkUploadLog({
            tenantId: tid,
            operation: "upsert_images",
            ref: String(item.productId),
            errorMessage: msg,
          });
          failed.push(String(item.productId));
        }
      }

      return { updated: updated.length, failed, extraImageWarnings };
    }),

  // Admin: fill missing English translations for all products using AI
  // Admin: compute AI translation suggestions for products missing English
  // copy, WITHOUT writing anything — the admin reviews/amends the proposed
  // list and only applyAutoTranslateAll persists the approved subset.
  previewAutoTranslateAll: adminProcedure.mutation(async ({ ctx }) => {
    const { invokeLLM } = await import("../_core/llm");
    const missing = await getProductsMissingTranslation(ctx.user.tenantId);
    if (missing.length === 0) return { proposals: [], total: 0 };

    const BATCH_SIZE = 10;
    const proposals: Array<{
      id: number;
      name: string;
      nameEn: string;
      descriptionEn: string;
    }> = [];

    for (let i = 0; i < missing.length; i += BATCH_SIZE) {
      const batch = missing.slice(i, i + BATCH_SIZE);
      const items = batch.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
        category: p.category,
      }));

      try {
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are a bilingual copywriter for Kalakosh Jewellery, a luxury jewellery boutique in Zurich, Switzerland.
Translate each German jewellery product into elegant English.
- nameEn: 2-5 words, same style and specificity as the German name
- descriptionEn: exactly one lyrical sentence — same sensory tone and jewel specificity as the German
Return ONLY valid JSON, no markdown.`,
            },
            {
              role: "user",
              content: `Translate these jewellery products:\n${JSON.stringify(items)}`,
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "translations",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  items: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "number" },
                        nameEn: { type: "string" },
                        descriptionEn: { type: "string" },
                      },
                      required: ["id", "nameEn", "descriptionEn"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["items"],
                additionalProperties: false,
              },
            },
          },
        });

        const rawContent = response.choices?.[0]?.message?.content;
        if (!rawContent) continue;
        const content =
          typeof rawContent === "string"
            ? rawContent
            : JSON.stringify(rawContent);
        const parsed = JSON.parse(content) as {
          items: Array<{ id: number; nameEn: string; descriptionEn: string }>;
        };

        for (const item of parsed.items) {
          const original = batch.find(p => p.id === item.id);
          if (!original) continue;
          const nameEn = !original.nameEn && item.nameEn ? item.nameEn : "";
          const descriptionEn =
            !original.descriptionEn && item.descriptionEn
              ? item.descriptionEn
              : "";
          if (nameEn || descriptionEn) {
            proposals.push({
              id: item.id,
              name: original.name,
              nameEn,
              descriptionEn,
            });
          }
        }
      } catch (err) {
        console.error(
          `[AutoTranslate] Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`,
          err
        );
      }
    }

    return { proposals, total: missing.length };
  }),

  // Admin: persist exactly the translation proposals the admin approved.
  applyAutoTranslateAll: adminProcedure
    .input(
      z.object({
        items: z
          .array(
            z.object({
              id: z.number(),
              nameEn: z.string().optional(),
              descriptionEn: z.string().optional(),
            })
          )
          .min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const tid = ctx.user.tenantId;
      let updated = 0;
      for (const item of input.items) {
        const patch: Record<string, string> = {};
        if (item.nameEn) patch.nameEn = item.nameEn;
        if (item.descriptionEn) patch.descriptionEn = item.descriptionEn;
        if (Object.keys(patch).length === 0) continue;
        await updateProduct(
          tid,
          item.id,
          patch as Parameters<typeof updateProduct>[2]
        );
        updated++;
      }
      return { updated };
    }),

  // Admin: AI-generated insights from sales and inventory data
  insights: adminProcedure.mutation(async ({ ctx }) => {
    const { invokeLLM } = await import("../_core/llm");
    const [allProducts, paidOrders] = await Promise.all([
      getAllProducts(ctx.user.tenantId),
      getPaidOrders(200),
    ]);

    const productSalesMap: Record<number, number> = {};
    for (const order of paidOrders) {
      const ids = order.productIds.split(",").map(Number).filter(Boolean);
      for (const id of ids) {
        productSalesMap[id] = (productSalesMap[id] ?? 0) + 1;
      }
    }

    const productData = allProducts.slice(0, 60).map(p => ({
      id: p.id,
      name: p.name,
      category: p.category,
      price: Number(p.price),
      visible: p.visible,
      sold: p.sold,
      quantity: p.quantity,
      timesSold: productSalesMap[p.id] ?? 0,
      daysInCatalogue: Math.floor(
        (Date.now() - new Date(p.createdAt).getTime()) / 86400000
      ),
    }));

    const summary = {
      totalProducts: allProducts.length,
      visibleProducts: allProducts.filter(p => p.visible).length,
      soldProducts: allProducts.filter(p => p.sold).length,
      totalOrders: paidOrders.length,
      totalRevenueCHF: paidOrders.reduce((s, o) => s + o.amountTotal, 0) / 100,
      categoryBreakdown: Object.fromEntries(
        PRODUCT_CATEGORIES.map(category => [
          category,
          allProducts.filter(p => p.category === category).length,
        ])
      ) as Record<(typeof PRODUCT_CATEGORIES)[number], number>,
      products: productData,
    };

    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are a retail analytics advisor for Kalakosh Jewellery, a luxury jewellery boutique in Zurich.
Analyse the inventory and sales snapshot and return concise, actionable insights in English.
Be specific with numbers. Each insight must be exactly one clear sentence.`,
        },
        {
          role: "user",
          content: `Analyse this sales and inventory snapshot:\n${JSON.stringify(summary)}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "insights",
          strict: true,
          schema: {
            type: "object",
            properties: {
              highlights: {
                type: "array",
                description: "3-5 key factual observations about the data",
                items: { type: "string" },
              },
              recommendations: {
                type: "array",
                description:
                  "3-5 actionable recommendations for the store owner",
                items: { type: "string" },
              },
              topCategory: {
                type: "string",
                description: "Name of the best-performing product category",
              },
              slowMovers: {
                type: "array",
                description:
                  "1-3 product names that have been unsold the longest",
                items: { type: "string" },
              },
            },
            required: [
              "highlights",
              "recommendations",
              "topCategory",
              "slowMovers",
            ],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent = response.choices?.[0]?.message?.content;
    if (!rawContent)
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "No AI response",
      });
    const content =
      typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
    return JSON.parse(content) as {
      highlights: string[];
      recommendations: string[];
      topCategory: string;
      slowMovers: string[];
    };
  }),

  // Admin: detect near-duplicate products in the catalogue before creating a new one
  checkDuplicate: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().min(1),
        category: z.enum(PRODUCT_CATEGORIES),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { invokeLLM } = await import("../_core/llm");
      const existing = await getAllProducts(ctx.user.tenantId);
      if (existing.length === 0) return { duplicates: [] };

      const sameCat = existing.filter(p => p.category === input.category);
      const candidates = (sameCat.length > 0 ? sameCat : existing).slice(0, 60);
      const catalogue = candidates.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
      }));

      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `You are a duplicate detector for a jewellery catalogue.
Given a proposed new product and the existing catalogue, identify products that represent the same jewellery piece (same type AND same material/stone).
Different colour, size, finish, or style = NOT a duplicate.
Return only genuine near-duplicates. Return an empty duplicates array if there are none.`,
          },
          {
            role: "user",
            content: `New product: ${JSON.stringify({ name: input.name, description: input.description, category: input.category })}\n\nExisting catalogue: ${JSON.stringify(catalogue)}`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "duplicate_check",
            strict: true,
            schema: {
              type: "object",
              properties: {
                duplicates: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "number" },
                      name: { type: "string" },
                      confidence: { type: "string", enum: ["high", "medium"] },
                      reason: { type: "string" },
                    },
                    required: ["id", "name", "confidence", "reason"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["duplicates"],
              additionalProperties: false,
            },
          },
        },
      });

      const rawContent = response.choices?.[0]?.message?.content;
      if (!rawContent) return { duplicates: [] };
      const content =
        typeof rawContent === "string"
          ? rawContent
          : JSON.stringify(rawContent);
      const parsed = JSON.parse(content) as {
        duplicates: Array<{
          id: number;
          name: string;
          confidence: string;
          reason: string;
        }>;
      };
      return { duplicates: parsed.duplicates };
    }),

  // Admin: compute AI category suggestions for products still in 'Other',
  // WITHOUT writing anything — the admin reviews/amends the proposed list
  // and only applyRecategorizeAll persists the approved subset.
  previewRecategorizeAll: adminProcedure.mutation(async ({ ctx }) => {
    const { invokeLLM } = await import("../_core/llm");
    const all = await getAllProducts(ctx.user.tenantId);
    const uncategorised = all.filter(p => p.category === "Other");
    if (uncategorised.length === 0) return { proposals: [], total: 0 };

    const BATCH_SIZE = 10;
    const proposals: Array<{
      id: number;
      name: string;
      from: string;
      to: string;
    }> = [];

    for (let i = 0; i < uncategorised.length; i += BATCH_SIZE) {
      const batch = uncategorised.slice(i, i + BATCH_SIZE);
      const items = batch.map(p => ({
        id: p.id,
        name: p.name,
        nameEn: p.nameEn ?? "",
        description: p.description,
      }));

      try {
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are a jewellery category classifier for Kalakosh Jewellery, Zurich.
For each product assign exactly one body-part category from this list:
  "Necklaces" — necklaces, pendants, chokers, lariats, collar pieces, kollier, halskette, kette, anhänger
  "Earrings" — studs, drops, hoops, chandeliers, ear cuffs, ohrringe, ohrstecker, ohrhänger, ohrclip
  "Rings" — finger rings of any style, ring, fingerring
  "Bracelets" — chain bracelets, cuffs, charm bracelets, flexible wrist pieces, armband
  "Bangles" — rigid circular bangles, armreif, starre armreifen
  "Anklets" — ankle chains, payal, fussband, fußband, knöchelkette
  "Brooches" — pins, brooches, lapel jewellery, brosche, anstecknadel
  "Hair Accessories" — hair pins, maang tikka, juda pins, hair combs, haarnadel, haarschmuck, haarspange
  "Other" — body chains, sets, or anything that genuinely doesn't fit above
Use the German name and description as primary signal; the English name as a hint.
Return ONLY valid JSON, no markdown.`,
            },
            {
              role: "user",
              content: `Classify these jewellery products:\n${JSON.stringify(items)}`,
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "categorisations",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  items: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "number" },
                        category: {
                          type: "string",
                          enum: [...PRODUCT_CATEGORIES],
                        },
                      },
                      required: ["id", "category"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["items"],
                additionalProperties: false,
              },
            },
          },
        });

        const rawContent = response.choices?.[0]?.message?.content;
        if (!rawContent) continue;
        const content =
          typeof rawContent === "string"
            ? rawContent
            : JSON.stringify(rawContent);
        const parsed = JSON.parse(content) as {
          items: Array<{ id: number; category: string }>;
        };

        for (const item of parsed.items) {
          const original = batch.find(p => p.id === item.id);
          if (original && item.category && item.category !== "Other") {
            proposals.push({
              id: item.id,
              name: original.name,
              from: "Other",
              to: item.category,
            });
          }
        }
      } catch (err) {
        console.error(
          `[ReCategorize] Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`,
          err
        );
      }
    }

    return { proposals, total: uncategorised.length };
  }),

  // Admin: persist exactly the category proposals the admin approved.
  applyRecategorizeAll: adminProcedure
    .input(
      z.object({
        items: z
          .array(
            z.object({ id: z.number(), category: z.enum(PRODUCT_CATEGORIES) })
          )
          .min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const tid = ctx.user.tenantId;
      let updated = 0;
      for (const item of input.items) {
        await updateProduct(tid, item.id, { category: item.category });
        updated++;
      }
      return { updated };
    }),

  // Admin: retrieve recent bulk upload AI error logs
  getBulkLogs: adminProcedure.query(async () => {
    return getBulkUploadLogs(200);
  }),

  // Admin: manually create a product
  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        nameEn: z.string().optional(),
        description: z.string().min(1),
        descriptionEn: z.string().optional(),
        price: z.number().positive(),
        category: z.enum(PRODUCT_CATEGORIES),
        quantity: z.number().int().min(0).default(1),
        imageUrl: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await createProduct({
        tenantId: ctx.user.tenantId,
        name: input.name,
        nameEn: input.nameEn ?? null,
        description: input.description,
        descriptionEn: input.descriptionEn ?? null,
        price: String(input.price),
        category: input.category,
        quantity: input.quantity ?? 1,
        imageUrl: input.imageUrl,
        visible: true,
        source: "manual",
      });
      return { success: true };
    }),

  // Admin: update product details (name, description, price, category)
  update: adminProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        nameEn: z.string().nullable().optional(),
        description: z.string().min(1).optional(),
        descriptionEn: z.string().nullable().optional(),
        price: z.number().positive().optional(),
        category: z.enum(PRODUCT_CATEGORIES).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, price, ...rest } = input;
      const data: Record<string, unknown> = { ...rest };
      if (price !== undefined) data.price = String(price);
      await updateProduct(
        ctx.user.tenantId,
        id,
        data as Parameters<typeof updateProduct>[2]
      );
      return { success: true };
    }),

  // Admin: import multiple products from CSV rows
  csvImport: adminProcedure
    .input(
      z.object({
        rows: z
          .array(
            z.object({
              name: z.string().min(1),
              nameEn: z.string().optional(),
              description: z.string().min(1),
              descriptionEn: z.string().optional(),
              price: z.number().positive(),
              category: z.enum(PRODUCT_CATEGORIES),
              quantity: z.number().int().min(0).default(1),
              imageUrl: z.string().optional(),
            })
          )
          .min(1)
          .max(500),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const tid = ctx.user.tenantId;
      // Match rows against existing products by name so re-importing the same
      // sheet (the normal workflow after editing it) updates in place instead
      // of creating a fresh duplicate row for every already-imported item.
      const existing = await getAllProducts(tid);
      const byName = new Map(
        existing.map(p => [p.name.trim().toLowerCase(), p])
      );

      const created: string[] = [];
      const updated: string[] = [];
      const failed: string[] = [];
      for (const row of input.rows) {
        try {
          const match = byName.get(row.name.trim().toLowerCase());
          if (match) {
            const patch: Record<string, unknown> = {
              description: row.description,
              price: String(row.price),
              category: row.category,
              quantity: row.quantity ?? 1,
            };
            if (row.nameEn) patch.nameEn = row.nameEn;
            if (row.descriptionEn) patch.descriptionEn = row.descriptionEn;
            if (row.imageUrl) patch.imageUrl = row.imageUrl;
            await updateProduct(
              tid,
              match.id,
              patch as Parameters<typeof updateProduct>[2]
            );
            updated.push(row.name);
          } else {
            await createProduct({
              tenantId: tid,
              name: row.name,
              nameEn: row.nameEn ?? null,
              description: row.description,
              descriptionEn: row.descriptionEn ?? null,
              price: String(row.price),
              category: row.category,
              quantity: row.quantity ?? 1,
              imageUrl: row.imageUrl ?? null,
              visible: true,
              source: "manual",
            });
            created.push(row.name);
          }
        } catch {
          failed.push(row.name);
        }
      }
      return { created: created.length, updated: updated.length, failed };
    }),

  // Admin: parse a photo of handwritten inventory notes into structured product rows via AI vision
  parseHandwrittenInventory: adminProcedure
    .input(
      z.object({
        imageData: z.string(), // base64 data URL
        mimeType: z.string().default("image/jpeg"),
      })
    )
    .mutation(async ({ input }) => {
      const { invokeLLM } = await import("../_core/llm");
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `You are an inventory data extractor for Kalakosh Jewellery, a luxury jewellery boutique in Zurich, Switzerland.

The user will provide a photo of handwritten inventory notes from a diary or notebook. Notes are usually organized as one "box" per page, with a heading at the top (for example "Rings Box", "Necklace Box", "Bangles") followed by a numbered list of items, each with a price and sometimes a quantity note.

Read the whole page first. Then extract every readable numbered/listed item as one product, following these steps for each one:

STEP 1 — Find the page heading.
Look at the top of the page for a title or box label. This heading tells you what type of jewellery EVERY item on the page is, even when an item's own text is just a gemstone or material name and never says the word "ring", "necklace", etc. For example, on a page headed "Rings Box", an item written only as "Lemon Quartz - 50 CHF" is a ring — use the heading, not the item text, to know that.

STEP 2 — Assign a category.
category must be exactly one of: ${PRODUCT_CATEGORIES.map(c => `"${c}"`).join(", ")}.
- Prefer the most specific category (Necklaces, Earrings, Rings, Bracelets, Bangles, Anklets, Brooches, Hair Accessories) based on the page heading first, then the item's own description.
- Treat "Sets" and "Other" as last-resort categories. Only use "Sets" when the item text explicitly describes a combined piece (e.g. a matching necklace-and-earring set). Only use "Other" when neither the page heading nor the item text gives any clue about the jewellery type.
- Never pick "Sets" or "Other" purely because a gemstone or material name by itself doesn't state the jewellery type — check the page heading first.

STEP 3 — Estimate quantity.
quantity is an integer count of how many physical pieces of that exact item are in stock.
- Default to 1 if nothing about quantity is written for that item.
- Watch for a shorthand quantity note anywhere in or after the item's line, such as "3pc", "3pcs", "3 pc", "(2 pcs)", "2/pcs", "x2", "2x", or "pair" (= 2). Use the number from that note as the quantity instead of 1.
- Examples: "Amethyst - 3pc - 95 Fr." → quantity 3. "Navratan Gold Polish - 68 Fr. (2/pcs)" → quantity 2. "Peridot - 45 CHF" (nothing about quantity written) → quantity 1.
- A quantity note is never part of the name or the price — leave it out of those fields.

STEP 4 — Extract the remaining fields.
- name: product name (keep original language; German preferred), with any quantity note and price removed.
- description: one-sentence description (German preferred, or infer from name/context).
- price: numeric CHF price (digits only, no currency symbol). Notes may write "CHF" or "Fr." — both mean Swiss francs; extract just the number.

If a field is partly illegible, make a reasonable guess based on context. Omit entries that are completely unreadable.
Return ONLY a valid JSON object — no markdown, no extra text.`,
          },
          {
            role: "user",
            content: [
              {
                type: "image_url" as const,
                image_url: { url: input.imageData, detail: "high" as const },
              },
              {
                type: "text" as const,
                text: "Extract all product inventory entries from this handwritten note.",
              },
            ],
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "handwritten_inventory",
            strict: true,
            schema: {
              type: "object",
              properties: {
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      description: { type: "string" },
                      price: { type: "number" },
                      category: {
                        type: "string",
                        enum: [...PRODUCT_CATEGORIES],
                      },
                      quantity: { type: "integer" },
                    },
                    required: [
                      "name",
                      "description",
                      "price",
                      "category",
                      "quantity",
                    ],
                    additionalProperties: false,
                  },
                },
              },
              required: ["items"],
              additionalProperties: false,
            },
          },
        },
      });

      const rawContent = response.choices?.[0]?.message?.content;
      if (!rawContent)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "No response from AI",
        });
      const content =
        typeof rawContent === "string"
          ? rawContent
          : JSON.stringify(rawContent);
      const parsed = JSON.parse(content) as {
        items: Array<{
          name: string;
          description: string;
          price: number;
          category: string;
          quantity: number;
        }>;
      };
      return { items: parsed.items };
    }),

  // Admin: proxy-fetch a CSV URL (handles Google Sheets share URLs server-side to avoid CORS)
  fetchSheetCsv: adminProcedure
    .input(z.object({ url: z.string().url() }))
    .mutation(async ({ input }) => {
      let fetchUrl = input.url;
      const sheetMatch = input.url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
      if (sheetMatch) {
        const gidMatch = input.url.match(/[?&]gid=(\d+)/);
        fetchUrl = `https://docs.google.com/spreadsheets/d/${sheetMatch[1]}/export?format=csv${gidMatch ? `&gid=${gidMatch[1]}` : ""}`;
      }
      const parsed = new URL(fetchUrl);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only http(s) URLs are allowed",
        });
      }
      await assertPublicHostname(parsed.hostname);
      const res = await fetch(fetchUrl);
      if (!res.ok)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Fetch failed: ${res.status} ${res.statusText}`,
        });
      const text = await res.text();
      if (text.length > 2_000_000)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Response too large (>2MB)",
        });
      return { csv: text };
    }),
});
