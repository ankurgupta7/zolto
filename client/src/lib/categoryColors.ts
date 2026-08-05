/**
 * Category badge colours.
 *
 * Categories are per-tenant strings now, so colours can't be a hand-typed
 * map. Known legacy jewellery keys keep the exact colours they always had
 * (existing stores shouldn't reshuffle); anything else hashes into the same
 * palette deterministically, so a given category name always gets the same
 * colour on every surface.
 */

const PALETTE = [
  "bg-[#F5EFE8] text-[#8B6914]",
  "bg-[#E8E8E8] text-[#555]",
  "bg-[#F5E8F0] text-[#8B2D6B]",
  "bg-[#E8F4EC] text-[#2D6B4A]",
  "bg-[#EEE8F5] text-[#5A2D82]",
  "bg-[#F5E8E8] text-[#8B2020]",
  "bg-[#E8F0E8] text-[#2D4A20]",
  "bg-[#FFF0DC] text-[#8B5914]",
  "bg-[#E8EEF5] text-[#1A3D6B]",
  "bg-[#EEEEEE] text-[#666]",
] as const;

const LEGACY_COLORS: Record<string, string> = {
  Necklaces: "bg-[#F5EFE8] text-[#8B6914]",
  Earrings: "bg-[#E8E8E8] text-[#555]",
  Sets: "bg-[#F5E8F0] text-[#8B2D6B]",
  Rings: "bg-[#E8F4EC] text-[#2D6B4A]",
  Bracelets: "bg-[#EEE8F5] text-[#5A2D82]",
  Bangles: "bg-[#F5E8E8] text-[#8B2020]",
  Anklets: "bg-[#E8F0E8] text-[#2D4A20]",
  Brooches: "bg-[#FFF0DC] text-[#8B5914]",
  "Hair Accessories": "bg-[#E8EEF5] text-[#1A3D6B]",
  Other: "bg-[#EEEEEE] text-[#666]",
};

export function categoryColor(key: string): string {
  const legacy = LEGACY_COLORS[key];
  if (legacy) return legacy;
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}
