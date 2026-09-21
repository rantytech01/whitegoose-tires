// Pure helpers for Safaricom Daraja (M-Pesa Express / STK Push). Kept free of
// Nest/HTTP so they can be unit-tested against sample payloads.

const EAT_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Daraja timestamp: YYYYMMDDHHmmss in East Africa Time. */
export function stkTimestamp(now: Date = new Date()): string {
  return new Date(now.getTime() + EAT_OFFSET_MS).toISOString().replace(/[-:T]/g, "").slice(0, 14);
}

/** base64(shortcode + passkey + timestamp) */
export function stkPassword(shortcode: string, passkey: string, timestamp: string): string {
  return Buffer.from(`${shortcode}${passkey}${timestamp}`).toString("base64");
}

/** Callback TransactionDate (e.g. 20240131142530) is EAT wall-clock time. */
export function parseMpesaDate(value: unknown): Date | undefined {
  const s = String(value ?? "");
  const m = s.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (!m) return undefined;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+03:00`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export interface StkCallbackResult {
  merchantRequestId: string;
  checkoutRequestId: string;
  /** 0 = paid. 1032 = cancelled by the customer, 1037 = prompt timed out, etc. */
  resultCode: number;
  resultDesc: string;
  amount?: number;
  receipt?: string;
  phone?: string;
  transactionDate?: Date;
}

/** Extracts the useful fields from the STK callback envelope; null if it isn't one. */
export function parseStkCallback(body: unknown): StkCallbackResult | null {
  const cb = (body as any)?.Body?.stkCallback;
  if (!cb || typeof cb.CheckoutRequestID !== "string" || cb.ResultCode === undefined) return null;

  const items: { Name: string; Value?: unknown }[] = Array.isArray(cb.CallbackMetadata?.Item) ? cb.CallbackMetadata.Item : [];
  const get = (name: string) => items.find((i) => i?.Name === name)?.Value;

  const amount = get("Amount");
  const receipt = get("MpesaReceiptNumber");
  const phone = get("PhoneNumber");
  return {
    merchantRequestId: String(cb.MerchantRequestID ?? ""),
    checkoutRequestId: cb.CheckoutRequestID,
    resultCode: Number(cb.ResultCode),
    resultDesc: String(cb.ResultDesc ?? ""),
    amount: amount !== undefined ? Number(amount) : undefined,
    receipt: receipt !== undefined ? String(receipt) : undefined,
    phone: phone !== undefined ? String(phone) : undefined,
    transactionDate: parseMpesaDate(get("TransactionDate")),
  };
}
