// Shared types between client and server

// Categories are per-tenant (tenant_categories, seeded from
// shared/verticals.ts presets); the type alias lives in ./const.
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
