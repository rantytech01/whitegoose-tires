import { Type } from "class-transformer";
import {
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import type { DeliveryMethod } from "../../../database/entities/order.entity";

export class ContactDto {
  @IsString() @MinLength(2) @MaxLength(150) fullName: string;
  @IsOptional() @IsEmail() email?: string;
  @IsString() @MaxLength(20) phone: string;
}

export class DeliveryAddressDto {
  @IsOptional() @IsString() @MaxLength(40) label?: string;
  @IsString() @MinLength(3) @MaxLength(150) line1: string;
  @IsString() @MaxLength(60) city: string;
  @IsOptional() @IsString() @MaxLength(255) notes?: string;
}

export class CreateOrderDto {
  @IsIn(["delivery", "pickup"]) deliveryMethod: DeliveryMethod;

  // Required for pickup (which branch the customer collects from); optional
  // for delivery, where the system picks a branch that can fill the whole order.
  @IsOptional() @IsInt() @Min(1) @Max(1_000_000) branchId?: number;

  @ValidateNested() @Type(() => ContactDto) contact: ContactDto;

  @ValidateIf((o) => o.deliveryMethod === "delivery")
  @ValidateNested()
  @Type(() => DeliveryAddressDto)
  deliveryAddress?: DeliveryAddressDto;

  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}
