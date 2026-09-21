import { IsDateString, IsIn, IsNumberString, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { ORDER_STATUSES } from "../order-status";

export class PaginationDto {
  @IsOptional() @IsNumberString() page?: string;
  @IsOptional() @IsNumberString() limit?: string;
}

export class QueryOrdersDto extends PaginationDto {
  @IsOptional() @IsIn(ORDER_STATUSES) status?: string;
  @IsOptional() @IsNumberString() branchId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  // order number prefix or customer phone
  @IsOptional() @IsString() @MaxLength(30) q?: string;
}

export class TrackOrderDto {
  @IsString() @MinLength(3) @MaxLength(20) orderNumber: string;
  @IsString() @MaxLength(20) phone: string;
}

export class UpdateOrderStatusDto {
  @IsIn(ORDER_STATUSES) status: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}
