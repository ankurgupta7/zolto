// Shared types between client and server

// Category list + type live in ./const so the Drizzle schema, Zod validators,
// LLM prompts, and client can all derive from one source of truth.
export { PRODUCT_CATEGORIES, CATEGORY_EXTRA_INCLUDES } from "./const";
export type { ProductCategory } from "./const";
import type { ProductCategory } from "./const";

export interface ProductItem {
  id: number;
  name: string;
  description: string;
  nameEn: string | null;
  descriptionEn: string | null;
  price: string;
  category: ProductCategory;
  imageKey: string | null;
  imageUrl: string | null;
  visible: boolean;
  sold: boolean;
  quantity: number;
  source: "whatsapp" | "manual";
  createdAt: Date;
  updatedAt: Date;
}
