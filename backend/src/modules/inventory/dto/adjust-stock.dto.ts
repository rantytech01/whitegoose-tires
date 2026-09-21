import { IsIn, IsInt, IsUUID, Min, NotEquals } from "class-validator";

export class AdjustStockDto {
  @IsUUID() productId: string;
  @IsInt() @Min(1) branchId: number;

  // Positive = stock in, negative = stock out. Never zero.
  @IsInt() @NotEquals(0) changeQty: number;

  // 'sale' and 'transfer' are written by the system, not by manual adjustments.
  @IsIn(["purchase", "adjustment", "return"]) reason: "purchase" | "adjustment" | "return";
}
