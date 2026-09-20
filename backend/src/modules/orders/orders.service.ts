import { Injectable } from "@nestjs/common";

// Cart-to-order flow, order status transitions (pending -> delivered), invoices.
// TODO: inject TypeORM repositories for the relevant tables from
// docs/database-schema.sql once entities are generated.
@Injectable()
export class OrdersService {
  findAll() {
    return { data: [], meta: { page: 1, limit: 20, total: 0 } };
  }

  findOne(id: string) {
    return { id };
  }
}
