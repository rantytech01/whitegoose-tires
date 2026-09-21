import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import type { PaymentMethod } from "../../../database/entities/payment.entity";

export class PayOrderDto {
  @IsIn(["mpesa", "card", "bank_transfer", "cod"]) method: PaymentMethod;

  // M-Pesa number to prompt; defaults to the order's contact phone.
  @IsOptional() @IsString() @MaxLength(20) phone?: string;

  // Bank transfer: the customer's transfer reference, if they have one yet.
  @IsOptional() @IsString() @MaxLength(100) reference?: string;
}

export class ConfirmPaymentDto {
  @IsOptional() @IsString() @MaxLength(100) reference?: string;
}
