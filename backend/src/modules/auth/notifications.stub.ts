import { Injectable, Logger } from "@nestjs/common";

// TODO: replace with real providers — Africa's Talking / Twilio for SMS,
// an email provider (SES/Postmark) for email, and the WhatsApp Business
// API for WhatsApp, using SMS_PROVIDER_API_KEY / WHATSAPP_API_TOKEN from
// .env. Kept as a single injectable so auth.service.ts doesn't need to
// change when the real integrations land.
@Injectable()
export class NotificationsStub {
  private readonly logger = new Logger("Notifications");

  async sendOtp(destination: string, code: string) {
    this.logger.log(`[STUB] OTP for ${destination}: ${code} (would be sent via SMS/email/WhatsApp)`);
  }

  async sendPasswordResetLink(destination: string, resetUrl: string) {
    this.logger.log(`[STUB] Password reset link for ${destination}: ${resetUrl}`);
  }
}
