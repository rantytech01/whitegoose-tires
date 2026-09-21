import { canTransition, ORDER_STATUSES } from "./order-status";

describe("order status machine", () => {
  it("allows the happy path", () => {
    expect(canTransition("pending", "confirmed")).toBe(true);
    expect(canTransition("confirmed", "packed")).toBe(true);
    expect(canTransition("packed", "dispatched")).toBe(true);
    expect(canTransition("dispatched", "delivered")).toBe(true);
  });

  it("allows cancellation until dispatch", () => {
    for (const from of ["pending", "confirmed", "packed"] as const) expect(canTransition(from, "cancelled")).toBe(true);
    expect(canTransition("dispatched", "cancelled")).toBe(false);
  });

  it("never moves out of a terminal state", () => {
    for (const to of ORDER_STATUSES) {
      expect(canTransition("delivered", to)).toBe(false);
      expect(canTransition("cancelled", to)).toBe(false);
    }
  });

  it("does not skip steps or go backwards", () => {
    expect(canTransition("pending", "packed")).toBe(false);
    expect(canTransition("pending", "delivered")).toBe(false);
    expect(canTransition("packed", "confirmed")).toBe(false);
  });
});
