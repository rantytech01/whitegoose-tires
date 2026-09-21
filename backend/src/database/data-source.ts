import "reflect-metadata";
import { DataSource } from "typeorm";
import * as entities from "./entities";

// The CLI requires exactly ONE exported DataSource instance (default export below).
// Used by the TypeORM CLI (`npm run migration:run` / `migration:generate`).
// The running app itself configures TypeOrmModule.forRoot separately in
// app.module.ts — this file exists purely for the CLI's benefit.
const AppDataSource = new DataSource({
  type: "postgres",
  url: process.env.DATABASE_URL,
  entities: Object.values(entities),
  migrations: ["src/database/migrations/*.ts"],
  synchronize: false,
});

export default AppDataSource;
