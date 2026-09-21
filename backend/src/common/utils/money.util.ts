export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

// Price a customer actually pays per unit after the product-level discount.
export function effectiveUnitPrice(price: number, discountPct: number): number {
  const pct = Math.min(Math.max(discountPct || 0, 0), 100);
  return round2(price * (1 - pct / 100));
}

// Order totals are rounded to whole shillings: M-Pesa STK push only accepts
// integer amounts, so the order total must equal what the customer is asked
// to pay or reconciliation drifts by cents.
export const roundKes = (n: number): number => Math.round(n);
