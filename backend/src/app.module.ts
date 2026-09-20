import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "./modules/auth/auth.module";
import { ProductsModule } from "./modules/products/products.module";
import { InventoryModule } from "./modules/inventory/inventory.module";
import { OrdersModule } from "./modules/orders/orders.module";
import { PaymentsModule } from "./modules/payments/payments.module";
import { CustomersModule } from "./modules/customers/customers.module";
import { CrmModule } from "./modules/crm/crm.module";
import { BranchesModule } from "./modules/branches/branches.module";
import { ReportsModule } from "./modules/reports/reports.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: "postgres",
      url: process.env.DATABASE_URL,
      autoLoadEntities: true,
      synchronize: false, // use migrations in every environment beyond local sandboxing
    }),
    AuthModule,
    ProductsModule,
    InventoryModule,
    OrdersModule,
    PaymentsModule,
    CustomersModule,
    CrmModule,
    BranchesModule,
    ReportsModule,
  ],
})
export class AppModule {}
