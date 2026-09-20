import { Injectable } from "@nestjs/common";

// Dashboard aggregates: sales trend, revenue, inventory value, top sellers.
// TODO: inject TypeORM repositories for the relevant tables from
// docs/database-schema.sql once entities are generated.
@Injectable()
export class ReportsService {
  findAll() {
    return { data: [], meta: { page: 1, limit: 20, total: 0 } };
  }

  findOne(id: string) {
    return { id };
  }
}
