import { Injectable } from "@nestjs/common";

// Branch directory, staff assignments, branch-level reporting.
// TODO: inject TypeORM repositories for the relevant tables from
// docs/database-schema.sql once entities are generated.
@Injectable()
export class BranchesService {
  findAll() {
    return { data: [], meta: { page: 1, limit: 20, total: 0 } };
  }

  findOne(id: string) {
    return { id };
  }
}
