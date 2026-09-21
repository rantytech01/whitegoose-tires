// Domain events emitted through @nestjs/event-emitter. Listeners (notifications,
// websocket gateway, reporting projections) subscribe without the emitting
// module knowing about them.
export const OrderEvents = {
  Created: "order.created",
  StatusChanged: "order.status_changed",
} as const;

export const PaymentEvents = {
  Completed: "payment.completed",
  // Money arrived for an order that had already been cancelled/expired.
  // Needs a human (refund or manual re-instatement).
  Orphaned: "payment.orphaned",
} as const;

export interface OrderStatusChange {
  orderId: string;
  orderNumber: string;
  customerId: string | null;
  branchId: number;
  from: string | null;
  to: string;
  at: Date;
}
