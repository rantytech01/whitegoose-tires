import { IsBoolean, IsInt, IsUUID, Max, Min } from "class-validator";

export class AddCartItemDto {
  @IsUUID() productId: string;
  @IsInt() @Min(1) @Max(50) quantity: number;
}

export class UpdateCartItemDto {
  @IsInt() @Min(1) @Max(50) quantity: number;
}

export class SaveForLaterDto {
  @IsBoolean() saved: boolean;
}
