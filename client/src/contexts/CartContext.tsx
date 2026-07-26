import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { ProductItem } from "@shared/types";

/**
 * Minimal product snapshot kept in the shopping bag. Each Kalakosh piece is
 * unique, so an item can only appear once and always has quantity 1.
 */
export interface CartItem {
  id: number;
  name: string;
  nameEn: string | null;
  nameDe?: string | null;
  nameFr?: string | null;
  price: string;
  imageUrl: string | null;
  category: string;
}

interface CartContextValue {
  items: CartItem[];
  count: number;
  total: number;
  has: (id: number) => boolean;
  addItem: (product: ProductItem) => void;
  removeItem: (id: number) => void;
  clear: () => void;
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  setOpen: (open: boolean) => void;
}

const STORAGE_KEY = "kalakosh_cart";

const CartContext = createContext<CartContextValue | null>(null);

function loadCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(loadCart);
  const [isOpen, setOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      /* ignore quota / private-mode errors */
    }
  }, [items]);

  const addItem = (product: ProductItem) => {
    setItems((prev) => {
      if (prev.some((i) => i.id === product.id)) return prev;
      return [
        ...prev,
        {
          id: product.id,
          name: product.name,
          nameEn: product.nameEn,
          nameDe: product.nameDe ?? null,
          nameFr: product.nameFr ?? null,
          price: product.price,
          imageUrl: product.imageUrl,
          category: product.category,
        },
      ];
    });
  };

  const removeItem = (id: number) =>
    setItems((prev) => prev.filter((i) => i.id !== id));
  const clear = () => setItems([]);
  const has = (id: number) => items.some((i) => i.id === id);

  const total = items.reduce((sum, i) => sum + Number(i.price), 0);

  return (
    <CartContext.Provider
      value={{
        items,
        count: items.length,
        total,
        has,
        addItem,
        removeItem,
        clear,
        isOpen,
        openCart: () => setOpen(true),
        closeCart: () => setOpen(false),
        setOpen,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}
