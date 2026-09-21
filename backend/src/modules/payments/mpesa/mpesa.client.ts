import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { stkPassword, stkTimestamp } from "./mpesa.util";

export class MpesaError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly httpStatus?: number,
  ) {
    super(message);
  }
}

/** Daraja says this while the customer is still looking at / answering the prompt. */
export const STK_STILL_PROCESSING = "500.001.1001";

// Thin Daraja client: OAuth token (cached), STK push, STK status query.
@Injectable()
export class MpesaClient {
  private readonly logger = new Logger(MpesaClient.name);
  private token: { value: string; expiresAt: number } | null = null;

  constructor(private config: ConfigService) {}

  private get(key: string): string {
    return this.config.get<string>(key) ?? "";
  }

  private get baseUrl(): string {
    return this.get("MPESA_ENV") === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
  }

  isConfigured(): boolean {
    return ["MPESA_CONSUMER_KEY", "MPESA_CONSUMER_SECRET", "MPESA_SHORTCODE", "MPESA_PASSKEY", "MPESA_CALLBACK_URL", "MPESA_CALLBACK_SECRET"].every(
      (k) => !!this.get(k),
    );
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, { ...init, signal: AbortSignal.timeout(15_000) });
    const text = await res.text();
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
    if (!res.ok) {
      throw new MpesaError(json?.errorMessage ?? `Daraja responded ${res.status}`, json?.errorCode, res.status);
    }
    return json as T;
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now()) return this.token.value;
    const basic = Buffer.from(`${this.get("MPESA_CONSUMER_KEY")}:${this.get("MPESA_CONSUMER_SECRET")}`).toString("base64");
    const res = await this.request<{ access_token: string; expires_in: string }>(
      "/oauth/v1/generate?grant_type=client_credentials",
      { method: "GET", headers: { Authorization: `Basic ${basic}` } },
    );
    // Refresh a minute early so a request never goes out with a token about to lapse.
    this.token = { value: res.access_token, expiresAt: Date.now() + (Number(res.expires_in) - 60) * 1000 };
    return this.token.value;
  }

  private async authedPost<T>(path: string, body: unknown): Promise<T> {
    const token = await this.accessToken();
    try {
      return await this.request<T>(path, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (err) {
      if (err instanceof MpesaError && err.httpStatus === 401) this.token = null; // force re-auth next time
      throw err;
    }
  }

  async stkPush(input: { phone: string; amount: number; accountReference: string; description: string }) {
    const shortcode = this.get("MPESA_SHORTCODE");
    const timestamp = stkTimestamp();
    const res = await this.authedPost<{
      MerchantRequestID: string;
      CheckoutRequestID: string;
      ResponseCode: string;
      ResponseDescription: string;
      CustomerMessage: string;
    }>("/mpesa/stkpush/v1/processrequest", {
      BusinessShortCode: shortcode,
      Password: stkPassword(shortcode, this.get("MPESA_PASSKEY"), timestamp),
      Timestamp: timestamp,
      // Paybill: CustomerPayBillOnline. Till number: CustomerBuyGoodsOnline (with MPESA_PARTY_B = the till).
      TransactionType: this.get("MPESA_TRANSACTION_TYPE") || "CustomerPayBillOnline",
      Amount: Math.round(input.amount),
      PartyA: input.phone,
      PartyB: this.get("MPESA_PARTY_B") || shortcode,
      PhoneNumber: input.phone,
      // The secret path segment is the only authentication Daraja callbacks carry.
      CallBackURL: `${this.get("MPESA_CALLBACK_URL").replace(/\/$/, "")}/${this.get("MPESA_CALLBACK_SECRET")}`,
      AccountReference: input.accountReference.slice(0, 12),
      TransactionDesc: input.description.slice(0, 13),
    });
    if (res.ResponseCode !== "0") throw new MpesaError(res.ResponseDescription, res.ResponseCode);
    return {
      merchantRequestId: res.MerchantRequestID,
      checkoutRequestId: res.CheckoutRequestID,
      customerMessage: res.CustomerMessage,
    };
  }

  /** Asks Daraja for the outcome of a prompt whose callback never arrived. */
  async stkQuery(checkoutRequestId: string) {
    const shortcode = this.get("MPESA_SHORTCODE");
    const timestamp = stkTimestamp();
    const res = await this.authedPost<{ ResultCode: string; ResultDesc: string }>("/mpesa/stkpushquery/v1/query", {
      BusinessShortCode: shortcode,
      Password: stkPassword(shortcode, this.get("MPESA_PASSKEY"), timestamp),
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    });
    return { resultCode: Number(res.ResultCode), resultDesc: res.ResultDesc };
  }
}
