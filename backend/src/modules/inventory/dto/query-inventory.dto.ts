import { Transform } from "class-transformer";
import { IsBoolean, IsNumberString, IsOptional } from "class-validator";

export class QueryInventoryDto {
  @IsOptional() @IsNumberString() branchId?: string;
  @IsOptional() @Transform(({ value }) => value === true || value === "true") @IsBoolean() lowStock?: boolean;
  @IsOptional() @IsNumberString() page?: string;
  @IsOptional() @IsNumberString() limit?: string;
}
