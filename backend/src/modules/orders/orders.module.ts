import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { OrdersController } from "./orders.controller";
import { AdminOrdersController } from "./admin-orders.controller";
import { OrdersService } from "./orders.service";
import { OrderExpiryService } from "./order-expiry.service";
import { CartModule } from "../cart/cart.module";
import { InventoryModule } from "../inventory/inventory.module";
import { Order } from "../../database/entities/order.entity";
import { OrderItem } from "../../database/entities/order-item.entity";
import { OrderStatusHistory } from "../../database/entities/order-status-history.entity";
import { Payment } from "../../database/entities/payment.entity";

@Module({
  imports: [TypeOrmModule.forFeature([Order, OrderItem, OrderStatusHistory, Payment]), CartModule, InventoryModule],
  controllers: [OrdersController, AdminOrdersController],
  providers: [OrdersService, OrderExpiryService],
  exports: [OrdersService],
})
export class OrdersModule {}
