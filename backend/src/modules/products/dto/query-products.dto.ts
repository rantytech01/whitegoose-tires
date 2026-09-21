import { IsIn, IsNumberString, IsOptional, IsString } from "class-validator";

export class QueryProductsDto {
  @IsOptional() @IsIn(["new", "used"]) type?: "new" | "used";
  @IsOptional() @IsString() category?: string; // category slug: tires | rims | accessories
  @IsOptional() @IsString() brand?: string;
  @IsOptional() @IsString() size?: string; // e.g. "205/55R16"
  @IsOptional() @IsNumberString() minPrice?: string;
  @IsOptional() @IsNumberString() maxPrice?: string;
  @IsOptional() @IsString() q?: string; // free-text search
  @IsOptional() @IsString() make?: string; // vehicle make
  @IsOptional() @IsString() model?: string; // vehicle model
  @IsOptional() @IsNumberString() year?: string; // vehicle year
  @IsOptional() @IsNumberString() page?: string;
  @IsOptional() @IsNumberString() limit?: string;
}
