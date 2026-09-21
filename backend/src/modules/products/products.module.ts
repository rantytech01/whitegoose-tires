import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ProductsController } from "./products.controller";
import { AdminProductsController } from "./admin-products.controller";
import { ProductsService } from "./products.service";
import { Product } from "../../database/entities/product.entity";
import { TireSpec } from "../../database/entities/tire-spec.entity";
import { ProductImage } from "../../database/entities/product-image.entity";
import { VehicleFitment } from "../../database/entities/vehicle-fitment.entity";
import { Brand } from "../../database/entities/brand.entity";
import { Category } from "../../database/entities/category.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([Product, TireSpec, ProductImage, VehicleFitment, Brand, Category]),
  ],
  controllers: [ProductsController, AdminProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
