import { Injectable } from "@nestjs/common";

// M-Pesa STK push, card charges, bank transfer reference capture, COD marking.
// TODO: inject TypeORM repositories for the relevant tables from
// docs/database-schema.sql once entities are generated.
@Injectable()
export class PaymentsService {
  findAll() {
    return { data: [], meta: { page: 1, limit: 20, total: 0 } };
  }

  findOne(id: string) {
    return { id };
  }
}
