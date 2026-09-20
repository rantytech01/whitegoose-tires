import { IsOptional, IsString, IsNumberString } from "class-validator";

export class QueryProductsDto {
  @IsOptional() @IsString() type?: "New" | "Used";
  @IsOptional() @IsString() brand?: string;
  @IsOptional() @IsString() size?: string;       // e.g. "205/55R16"
  @IsOptional() @IsNumberString() minPrice?: string;
  @IsOptional() @IsNumberString() maxPrice?: string;
  @IsOptional() @IsString() q?: string;          // free-text search
  @IsOptional() @IsNumberString() page?: string;
  @IsOptional() @IsNumberString() limit?: string;
}
