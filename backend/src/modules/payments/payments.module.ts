import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AdminPaymentsController, MpesaWebhookController, PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";
import { MpesaClient } from "./mpesa/mpesa.client";
import { OrdersModule } from "../orders/orders.module";
import { Order } from "../../database/entities/order.entity";
import { Payment } from "../../database/entities/payment.entity";

@Module({
  imports: [TypeOrmModule.forFeature([Payment, Order]), OrdersModule],
  controllers: [PaymentsController, AdminPaymentsController, MpesaWebhookController],
  providers: [PaymentsService, MpesaClient],
  exports: [PaymentsService],
})
export class PaymentsModule {}
