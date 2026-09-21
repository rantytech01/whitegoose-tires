import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { InventoryController } from "./inventory.controller";
import { InventoryService } from "./inventory.service";
import { Inventory } from "../../database/entities/inventory.entity";
import { StockMovement } from "../../database/entities/stock-movement.entity";
import { Branch } from "../../database/entities/branch.entity";
import { Product } from "../../database/entities/product.entity";

@Module({
  imports: [TypeOrmModule.forFeature([Inventory, StockMovement, Branch, Product])],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
