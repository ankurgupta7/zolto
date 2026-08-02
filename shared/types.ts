// Shared types between client and server

// Category list + type live in ./const so the Drizzle schema, Zod validators,
// LLM prompts, and client can all derive from one source of truth.
export { PRODUCT_CATEGORIES, CATEGORY_EXTRA_INCLUDES } from "./const";
export type { ProductCategory } from "./const";

export interface ProductItem {
  id: number;
  name: string;
  description: string;
  nameEn: string | null;
  descriptionEn: string | null;
  nameDe: string | null;
  descriptionDe: string | null;
  nameFr: string | null;
  descriptionFr: string | null;
  price: string;
  // A tenant_categories.key for the product's store (per-tenant list seeded
  // from the merchant's vertical preset — see shared/verticals.ts).
  category: string;
  imageKey: string | null;
  imageUrl: string | null;
  visible: boolean;
  sold: boolean;
  quantity: number;
  source: "whatsapp" | "manual";
  createdAt: Date;
  updatedAt: Date;
}
