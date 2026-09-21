import { effectiveUnitPrice, round2, roundKes } from "./money.util";

describe("money utils", () => {
  it("applies the product discount", () => {
    expect(effectiveUnitPrice(10000, 10)).toBe(9000);
    expect(effectiveUnitPrice(12999, 15)).toBe(11049.15);
  });

  it("ignores nonsense discounts", () => {
    expect(effectiveUnitPrice(5000, 0)).toBe(5000);
    expect(effectiveUnitPrice(5000, -20)).toBe(5000);
    expect(effectiveUnitPrice(5000, 150)).toBe(0);
    expect(effectiveUnitPrice(5000, NaN)).toBe(5000);
  });

  it("rounds to 2dp without float drift", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });

  it("rounds order totals to whole shillings (STK push needs integers)", () => {
    expect(roundKes(11049.15)).toBe(11049);
    expect(roundKes(11049.5)).toBe(11050);
  });
});
