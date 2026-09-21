import type { OrderStatus } from "../../database/entities/order.entity";

export const ORDER_STATUSES: OrderStatus[] = ["pending", "confirmed", "packed", "dispatched", "delivered", "cancelled"];

// Forward-only lifecycle. Cancellation is allowed until the parcel leaves the
// branch; after dispatch the order can only be delivered (returns/refunds are
// a separate flow).
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["packed", "cancelled"],
  packed: ["dispatched", "cancelled"],
  dispatched: ["delivered"],
  delivered: [],
  cancelled: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}
