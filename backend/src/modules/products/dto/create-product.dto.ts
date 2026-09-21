import { Type } from "class-transformer";
import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";

class TireSpecDto {
  @IsNumber() widthMm: number;
  @IsNumber() aspectRatio: number;
  @IsNumber() rimDiameterIn: number;
  @IsOptional() @IsNumber() loadIndex?: number;
  @IsOptional() @IsString() speedRating?: string;
  @IsOptional() @IsNumber() treadConditionPct?: number;
  @IsOptional() @IsString() season?: string;
}

export class CreateProductDto {
  @IsString() sku: string;
  @IsString() name: string;
  @IsIn(["new", "used"]) condition: "new" | "used";
  @IsOptional() @IsString() description?: string;
  @IsNumber() @Min(0) price: number;
  @IsOptional() @IsNumber() @Min(0) discountPct?: number;
  @IsOptional() @IsNumber() categoryId?: number;
  @IsOptional() @IsNumber() brandId?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) imageUrls?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => TireSpecDto)
  tireSpec?: TireSpecDto;
}
