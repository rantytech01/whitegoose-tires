import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { APP_GUARD } from "@nestjs/core";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";

import { AuthModule } from "./modules/auth/auth.module";
import { ProductsModule } from "./modules/products/products.module";
import { InventoryModule } from "./modules/inventory/inventory.module";
import { OrdersModule } from "./modules/orders/orders.module";
import { PaymentsModule } from "./modules/payments/payments.module";
import { CustomersModule } from "./modules/customers/customers.module";
import { CrmModule } from "./modules/crm/crm.module";
import { BranchesModule } from "./modules/branches/branches.module";
import { ReportsModule } from "./modules/reports/reports.module";
import { CartModule } from "./modules/cart/cart.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    // Baseline per-IP limit; sensitive routes (pay, track, checkout) tighten it with @Throttle.
    // In-memory per replica for now - move to a Redis-backed storage when running >1 API pod.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    TypeOrmModule.forRoot({
      type: "postgres",
      url: process.env.DATABASE_URL,
      autoLoadEntities: true,
      synchronize: false, // use migrations in every environment beyond local sandboxing
    }),
    AuthModule,
    ProductsModule,
    CartModule,
    InventoryModule,
    OrdersModule,
    PaymentsModule,
    CustomersModule,
    CrmModule,
    BranchesModule,
    ReportsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
