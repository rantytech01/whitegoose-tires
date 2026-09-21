import { Body, Controller, Delete, Param, Post, Put, UseGuards } from "@nestjs/common";
import { ProductsService } from "./products.service";
import { CreateProductDto } from "./dto/create-product.dto";
import { UpdateProductDto } from "./dto/update-product.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";

// Maps to the `products.write` permission in the schema doc. Full
// permission-code-level checks (role_permissions join) can replace this
// role-name check once an admin UI exists to manage that mapping —
// for now, staff roles that should have catalog write access are listed
// directly.
@Controller("admin/products")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("super_admin", "branch_manager", "inventory_clerk")
export class AdminProductsController {
  constructor(private productsService: ProductsService) {}

  @Post()
  create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @Put(":id")
  update(@Param("id") id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, dto);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.productsService.remove(id);
  }

  // TODO: POST /admin/products/:id/images — multipart upload to S3-compatible
  // storage once S3_ENDPOINT/S3_BUCKET credentials are wired (see .env.example).
}
