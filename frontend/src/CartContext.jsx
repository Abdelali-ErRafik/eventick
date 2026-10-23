"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

const CartContext = createContext(null);
const STORAGE_KEY = "eventick_cart";

// The cart only remembers *what's selected* client-side (event slug + tier
// lines). The 8-minute hold itself is now enforced server-side at checkout
// (backend/src/domain/inventory.ts holdExpiry), not by a client timer racing
// against other tabs the way the old Zustand store's `holdUntil` did.
export function CartProvider({ children }) {
  const [cart, setCartState] = useState(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setCartState(JSON.parse(raw));
    } catch {
      // ignore corrupt local state
    }
  }, []);

  const setCart = useCallback((next) => {
    setCartState(next);
    try {
      if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore storage failures (private browsing, quota)
    }
  }, []);

  const clear = useCallback(() => setCart(null), [setCart]);

  return <CartContext.Provider value={{ cart, setCart, clear }}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
