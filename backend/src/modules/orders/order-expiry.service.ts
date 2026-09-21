import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron, CronExpression } from "@nestjs/schedule";
import { DataSource } from "typeorm";
import { OrderStatusChange } from "../../common/events";
import { OrdersService } from "./orders.service";

// Stock is reserved when the order is placed, so unpaid orders must not hold
// it forever. Every few minutes, cancel pending orders whose payment window
// has passed and put the stock back.
//
//  - Default window: ORDER_PAYMENT_TTL_MINUTES (abandoned checkout, unanswered M-Pesa prompt).
//  - Orders with a pending bank transfer get the longer BANK_TRANSFER_TTL_HOURS.
//  - Orders with an M-Pesa prompt sent in the last 5 minutes are left alone
//    so a customer typing their PIN at the deadline isn't cancelled underneath.
//
// FOR UPDATE SKIP LOCKED makes this safe with several API replicas running it.
@Injectable()
export class OrderExpiryService {
  private readonly logger = new Logger(OrderExpiryService.name);

  constructor(
    private dataSource: DataSource,
    private orders: OrdersService,
    private config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async sweep(): Promise<number> {
    const ttlMin = Number(this.config.get("ORDER_PAYMENT_TTL_MINUTES") ?? 30);
    const bankHours = Number(this.config.get("BANK_TRANSFER_TTL_HOURS") ?? 48);
    const now = Date.now();
    const shortCutoff = new Date(now - ttlMin * 60_000);
    const longCutoff = new Date(now - bankHours * 3_600_000);

    let expired = 0;
    for (let batch = 0; batch < 10; batch++) {
      const changes: OrderStatusChange[] = await this.dataSource.transaction(async (m) => {
        const rows: { id: string }[] = await m.query(
          `SELECT o.id FROM orders o
            WHERE o.status = 'pending'
              AND (
                (o.created_at < $1 AND NOT EXISTS (
                   SELECT 1 FROM payments p WHERE p.order_id = o.id AND (
                     p.status = 'completed'
                     OR (p.method = 'bank_transfer' AND p.status = 'pending')
                     OR (p.method = 'mpesa' AND p.status = 'pending' AND p.created_at > now() - interval '5 minutes'))))
                OR
                (o.created_at < $2 AND NOT EXISTS (
                   SELECT 1 FROM payments p WHERE p.order_id = o.id AND p.status = 'completed'))
              )
            ORDER BY o.created_at
            LIMIT 50
            FOR UPDATE OF o SKIP LOCKED`,
          [shortCutoff, longCutoff],
        );
        const out: OrderStatusChange[] = [];
        for (const { id } of rows) {
          await m.query(
            `UPDATE payments SET status = 'failed', failure_reason = 'order_expired', updated_at = now()
              WHERE order_id = $1 AND status = 'pending'`,
            [id],
          );
          out.push(await this.orders.transition(m, id, "cancelled", { actorId: null, note: "Payment window expired" }));
        }
        return out;
      });

      changes.forEach((c) => this.orders.publish(c));
      expired += changes.length;
      if (changes.length < 50) break;
    }

    if (expired) this.logger.log(`Cancelled ${expired} unpaid order(s) and released their stock`);
    return expired;
  }
}
