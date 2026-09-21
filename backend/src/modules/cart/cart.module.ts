import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CartController } from "./cart.controller";
import { CartService } from "./cart.service";
import { InventoryModule } from "../inventory/inventory.module";
import { Cart } from "../../database/entities/cart.entity";
import { CartItem } from "../../database/entities/cart-item.entity";
import { Product } from "../../database/entities/product.entity";

@Module({
  imports: [TypeOrmModule.forFeature([Cart, CartItem, Product]), InventoryModule],
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}
