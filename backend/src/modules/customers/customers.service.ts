import { Injectable } from "@nestjs/common";

// Customer profiles, vehicles, addresses, wishlists, loyalty points.
// TODO: inject TypeORM repositories for the relevant tables from
// docs/database-schema.sql once entities are generated.
@Injectable()
export class CustomersService {
  findAll() {
    return { data: [], meta: { page: 1, limit: 20, total: 0 } };
  }

  findOne(id: string) {
    return { id };
  }
}
