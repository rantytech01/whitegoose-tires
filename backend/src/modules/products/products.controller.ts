import { Controller, Get, Param, Query } from "@nestjs/common";
import { ProductsService } from "./products.service";
import { QueryProductsDto } from "./dto/query-products.dto";

@Controller("products")
export class ProductsController {
  constructor(private productsService: ProductsService) {}

  @Get()
  findAll(@Query() query: QueryProductsDto) {
    return this.productsService.findAll(query);
  }

  @Get("autocomplete")
  autocomplete(@Query("q") q: string) {
    return this.productsService.autocomplete(q);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.productsService.findOne(id);
  }

  // Admin CRUD (products.write permission) lives in an AdminProductsController
  // guarded by JwtAuthGuard + RolesGuard — stubbed out for the next pass.
}
