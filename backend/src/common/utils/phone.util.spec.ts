import { normalizeKenyanMsisdn } from "./phone.util";

describe("normalizeKenyanMsisdn", () => {
  it.each([
    ["0712345678", "254712345678"],
    ["0712 345 678", "254712345678"],
    ["+254712345678", "254712345678"],
    ["254712345678", "254712345678"],
    ["0112-345-678", "254112345678"],
    ["(0722) 000 111", "254722000111"],
  ])("normalises %s", (input, expected) => {
    expect(normalizeKenyanMsisdn(input)).toBe(expected);
  });

  it.each(["", "12345", "0812345678", "+255712345678", "07123456789", "abcdefghij"])("rejects %s", (input) => {
    expect(normalizeKenyanMsisdn(input)).toBeNull();
  });

  it("handles null/undefined", () => {
    expect(normalizeKenyanMsisdn(null)).toBeNull();
    expect(normalizeKenyanMsisdn(undefined)).toBeNull();
  });
});
