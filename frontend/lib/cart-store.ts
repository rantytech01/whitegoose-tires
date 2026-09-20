import { create } from "zustand";
import type { CartItem } from "./types";

// Client-side cart state. Mirrors the `/cart` endpoint — call the API
// on every mutation once the backend cart module is wired up, and hydrate
// this store from the server response so guest carts survive a refresh.
interface CartState {
  items: CartItem[];
  addItem: (productId: string, quantity?: number) => void;
  removeItem: (productId: string) => void;
  clear: () => void;
}

export const useCartStore = create<CartState>((set) => ({
  items: [],
  addItem: (productId, quantity = 1) =>
    set((state) => {
      const existing = state.items.find((i) => i.productId === productId);
      if (existing) {
        return { items: state.items.map((i) => (i.productId === productId ? { ...i, quantity: i.quantity + quantity } : i)) };
      }
      return { items: [...state.items, { productId, quantity }] };
    }),
  removeItem: (productId) => set((state) => ({ items: state.items.filter((i) => i.productId !== productId) })),
  clear: () => set({ items: [] }),
}));
