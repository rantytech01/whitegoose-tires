// Cart + checkout summary — payment method selection (M-Pesa/card/COD)
// posts to POST /orders then POST /orders/:id/pay.
"use client";
import { useCartStore } from "@/lib/cart-store";

export default function CartPage() {
  const items = useCartStore((s) => s.items);
  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <h1 className="font-display text-3xl uppercase mb-6">Your Cart</h1>
      {items.length === 0 ? <p>Your cart is empty.</p> : <div>{/* cart lines + summary box */}</div>}
    </div>
  );
}
