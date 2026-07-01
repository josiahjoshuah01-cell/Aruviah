import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartItem } from "@/lib/types";

type CartState = {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "qty">, qty?: number) => void;
  removeItem: (variantId: string) => void;
  updateQty: (variantId: string, qty: number) => void;
  clearCart: () => void;
};

export const selectCartTotalItems = (s: CartState) =>
  s.items.reduce((sum, i) => sum + i.qty, 0);

export const selectCartSubtotal = (s: CartState) =>
  s.items.reduce((sum, i) => sum + i.price * i.qty, 0);

export const selectCartShipping = (s: CartState) =>
  s.items.reduce((sum, i) => sum + i.shippingCost * i.qty, 0);

export const selectCartTotalPrice = (s: CartState) =>
  selectCartSubtotal(s) + selectCartShipping(s);

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (item, qty = 1) => {
        set((state) => {
          const existing = state.items.find(
            (i) => i.variantId === item.variantId
          );
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.variantId === item.variantId
                  ? { ...i, qty: i.qty + qty }
                  : i
              ),
            };
          }
          return { items: [...state.items, { ...item, qty }] };
        });
      },
      removeItem: (variantId) => {
        set((state) => ({
          items: state.items.filter((i) => i.variantId !== variantId),
        }));
      },
      updateQty: (variantId, qty) => {
        if (qty <= 0) {
          get().removeItem(variantId);
          return;
        }
        set((state) => ({
          items: state.items.map((i) =>
            i.variantId === variantId ? { ...i, qty } : i
          ),
        }));
      },
      clearCart: () => set({ items: [] }),
    }),
    { name: "aruviah-cart" }
  )
);
