import { parseMpesaDate, parseStkCallback, stkPassword, stkTimestamp } from "./mpesa.util";

// Shape taken from Safaricom's documented STK callback payloads.
const success = {
  Body: {
    stkCallback: {
      MerchantRequestID: "29115-34620561-1",
      CheckoutRequestID: "ws_CO_191220191020363925",
      ResultCode: 0,
      ResultDesc: "The service request is processed successfully.",
      CallbackMetadata: {
        Item: [
          { Name: "Amount", Value: 11049 },
          { Name: "MpesaReceiptNumber", Value: "NLJ7RT61SV" },
          { Name: "TransactionDate", Value: 20191219102115 },
          { Name: "PhoneNumber", Value: 254708374149 },
        ],
      },
    },
  },
};

const cancelled = {
  Body: {
    stkCallback: {
      MerchantRequestID: "29115-34620561-1",
      CheckoutRequestID: "ws_CO_191220191020363925",
      ResultCode: 1032,
      ResultDesc: "Request cancelled by user",
    },
  },
};

describe("parseStkCallback", () => {
  it("extracts a successful payment", () => {
    const r = parseStkCallback(success)!;
    expect(r.resultCode).toBe(0);
    expect(r.checkoutRequestId).toBe("ws_CO_191220191020363925");
    expect(r.amount).toBe(11049);
    expect(r.receipt).toBe("NLJ7RT61SV");
    expect(r.phone).toBe("254708374149");
    expect(r.transactionDate?.toISOString()).toBe("2019-12-19T07:21:15.000Z"); // 10:21:15 EAT
  });

  it("handles a cancelled prompt (no metadata)", () => {
    const r = parseStkCallback(cancelled)!;
    expect(r.resultCode).toBe(1032);
    expect(r.resultDesc).toBe("Request cancelled by user");
    expect(r.amount).toBeUndefined();
    expect(r.receipt).toBeUndefined();
  });

  it.each([null, undefined, {}, { Body: {} }, { Body: { stkCallback: { ResultCode: 0 } } }, "nope"])(
    "returns null for malformed body %#",
    (body) => {
      expect(parseStkCallback(body)).toBeNull();
    },
  );
});

describe("daraja helpers", () => {
  it("formats the timestamp in EAT", () => {
    expect(stkTimestamp(new Date("2024-01-31T21:30:05Z"))).toBe("20240201003005"); // rolls into next day in Nairobi
  });

  it("builds the base64 password", () => {
    expect(stkPassword("174379", "pass", "20240201003005")).toBe(Buffer.from("174379pass20240201003005").toString("base64"));
  });

  it("rejects bad transaction dates", () => {
    expect(parseMpesaDate("2019")).toBeUndefined();
    expect(parseMpesaDate(undefined)).toBeUndefined();
    expect(parseMpesaDate(20191399999999)).toBeUndefined();
  });
});
