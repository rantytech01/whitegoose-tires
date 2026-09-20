import { Injectable } from "@nestjs/common";
import { QueryProductsDto } from "./dto/query-products.dto";

// TODO: inject the TypeORM repository and build a query with the
// idx_products_search / idx_tire_specs_size indexes from the schema doc.
@Injectable()
export class ProductsService {
  findAll(query: QueryProductsDto) {
    return { data: [], meta: { page: Number(query.page ?? 1), limit: Number(query.limit ?? 20), total: 0 } };
  }

  findOne(id: string) {
    return { id, message: "TODO: fetch product with specs, images, fitments" };
  }

  autocomplete(q: string) {
    return { suggestions: [] };
  }
}
