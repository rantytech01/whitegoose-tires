import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  NotImplementedException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EventEmitter2, OnEvent } from "@nestjs/event-emitter";
import { Cron } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { createHash, timingSafeEqual } from "crypto";
import { DataSource, LessThan, MoreThan, Repository, And } from "typeorm";
import { Order } from "../../database/entities/order.entity";
import { Payment } from "../../database/entities/payment.entity";
import { OrderEvents, OrderStatusChange, PaymentEvents } from "../../common/events";
import { normalizeKenyanMsisdn } from "../../common/utils/phone.util";
import { OrderActor, OrdersService } from "../orders/orders.service";
import { PayOrderDto } from "./dto/payments.dto";
import { MpesaClient, MpesaError, STK_STILL_PROCESSING } from "./mpesa/mpesa.client";
import { parseStkCallback, StkCallbackResult } from "./mpesa/mpesa.util";

const sha256 = (v: string) => createHash("sha256").update(v).digest();

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(Payment) private payments: Repository<Payment>,
    private dataSource: DataSource,
    private orders: OrdersService,
    private mpesa: MpesaClient,
    private events: EventEmitter2,
    private config: ConfigService,
  ) {}

  // ---- Starting a payment -----------------------------------------------------

  async initiate(orderId: string, actor: OrderActor, dto: PayOrderDto) {
    const order = await this.orders.getForActor(orderId, actor); // 404 unless the actor owns it
    if (order.status !== "pending") throw new ConflictException("This order is no longer awaiting payment");
    if (order.payments.some((p) => p.status === "completed")) throw new ConflictException("This order is already paid");

    switch (dto.method) {
      case "mpesa":
        return this.startMpesa(order, dto);
      case "cod":
        return this.startCod(order);
      case "bank_transfer":
        return this.startBankTransfer(order, dto);
      case "card":
        // TODO: pick a processor (Pesapal / Flutterwave / DPO / Stripe) and implement charge + webhook.
        throw new NotImplementedException("Card payments aren't available yet. Please use M-Pesa or bank transfer.");
    }
  }

  private async startMpesa(order: Order, dto: PayOrderDto) {
    if (!this.mpesa.isConfigured()) throw new ServiceUnavailableException("M-Pesa is temporarily unavailable");
    const phone = normalizeKenyanMsisdn(dto.phone ?? order.contact.phone);
    if (!phone) throw new BadRequestException("Enter a valid Safaricom number, e.g. 0712 345 678");

    // Insert the pending payment under the order lock so a double-click can't
    // fire two STK prompts. The Daraja call itself happens outside the transaction.
    const payment = await this.dataSource.transaction(async (m) => {
      const locked = await m.findOne(Order, { where: { id: order.id }, lock: { mode: "pessimistic_write" } });
      if (!locked || locked.status !== "pending") throw new ConflictException("This order is no longer awaiting payment");
      if (await m.exists(Payment, { where: { orderId: order.id, status: "completed" } })) {
        throw new ConflictException("This order is already paid");
      }
      const recent = await m.exists(Payment, {
        where: { orderId: order.id, method: "mpesa", status: "pending", createdAt: MoreThan(new Date(Date.now() - 90_000)) },
      });
      if (recent) {
        throw new ConflictException({
          code: "PAYMENT_IN_PROGRESS",
          message: "An M-Pesa prompt was just sent to your phone. Check it, or wait a minute before trying again.",
        });
      }
      return m.save(m.create(Payment, { orderId: order.id, method: "mpesa", amount: order.total, status: "pending", phone }));
    });

    try {
      const res = await this.mpesa.stkPush({
        phone,
        amount: order.total,
        accountReference: order.orderNumber,
        description: "WhiteGoose",
      });
      await this.payments.update(payment.id, {
        checkoutRequestId: res.checkoutRequestId,
        merchantRequestId: res.merchantRequestId,
      });
      return {
        payment: this.view({ ...payment, checkoutRequestId: res.checkoutRequestId }),
        customerMessage: res.customerMessage,
      };
    } catch (err: any) {
      this.logger.error(`STK push failed for ${order.orderNumber}: ${err?.message}`);
      await this.payments.update(payment.id, { status: "failed", failureReason: String(err?.message ?? "stk_push_failed").slice(0, 255) });
      throw new BadGatewayException("We couldn't send the M-Pesa prompt. Please try again in a moment.");
    }
  }

  private async startCod(order: Order) {
    const outcome = await this.dataSource.transaction(async (m) => {
      const payment = await m.save(m.create(Payment, { orderId: order.id, method: "cod", amount: order.total, status: "pending" }));
      const res = await this.orders.confirmAfterPayment(m, order.id, "Cash on delivery selected");
      if (!res.change) throw new ConflictException("This order is no longer awaiting payment");
      return { payment, change: res.change };
    });
    this.orders.publish(outcome.change);
    return { payment: this.view(outcome.payment), customerMessage: "Order confirmed. Pay in cash when it arrives." };
  }

  private async startBankTransfer(order: Order, dto: PayOrderDto) {
    let payment = order.payments.find((p) => p.method === "bank_transfer" && p.status === "pending");
    if (payment) {
      if (dto.reference) await this.payments.update(payment.id, { providerRef: dto.reference });
      payment = { ...payment, providerRef: dto.reference ?? payment.providerRef };
    } else {
      payment = await this.payments.save(
        this.payments.create({
          orderId: order.id,
          method: "bank_transfer",
          amount: order.total,
          status: "pending",
          providerRef: dto.reference ?? null,
        }),
      );
    }
    return {
      payment: this.view(payment),
      instructions: {
        bankName: this.config.get("BANK_NAME") ?? null,
        accountName: this.config.get("BANK_ACCOUNT_NAME") ?? null,
        accountNumber: this.config.get("BANK_ACCOUNT_NUMBER") ?? null,
        reference: order.orderNumber,
        amount: order.total,
      },
      customerMessage: "Your order will be confirmed once we receive the transfer.",
    };
  }

  // ---- M-Pesa results ---------------------------------------------------------

  /** Daraja's callback carries no signature; the secret path segment + matching CheckoutRequestID authenticate it. */
  async handleMpesaCallback(secret: string, body: unknown) {
    const expected = this.config.get<string>("MPESA_CALLBACK_SECRET");
    if (!expected || !timingSafeEqual(sha256(secret), sha256(expected))) throw new ForbiddenException();

    const result = parseStkCallback(body);
    if (!result) {
      this.logger.warn("Ignoring malformed M-Pesa callback");
      return;
    }
    await this.applyStkResult(result, body);
  }

  /**
   * Single place where an STK outcome (from the callback, a status query or
   * the reconciler) becomes a payment + order state change. Idempotent and
   * safe to run concurrently: the payment row is locked for the duration.
   */
  async applyStkResult(r: StkCallbackResult, raw: unknown | null) {
    const outcome = await this.dataSource.transaction(async (m) => {
      const payment = await m.findOne(Payment, {
        where: { checkoutRequestId: r.checkoutRequestId },
        lock: { mode: "pessimistic_write" },
      });
      if (!payment) {
        this.logger.warn(`M-Pesa result for unknown CheckoutRequestID ${r.checkoutRequestId}`);
        return null;
      }
      if (raw) payment.rawCallback = raw;
      const success = r.resultCode === 0;

      if (payment.status === "completed" || payment.status === "refunded") {
        // Already settled (e.g. via status query); the callback may still carry the receipt.
        if (success && !payment.providerRef && r.receipt) payment.providerRef = r.receipt;
        await m.save(payment);
        return null;
      }

      if (!success) {
        payment.status = "failed";
        payment.failureReason = `${r.resultCode}: ${r.resultDesc}`.slice(0, 255);
        await m.save(payment);
        return null;
      }

      if (r.amount !== undefined && r.amount < Number(payment.amount)) {
        payment.status = "failed";
        payment.failureReason = `amount_mismatch: expected ${payment.amount}, received ${r.amount}`;
        await m.save(payment);
        this.logger.error(`M-Pesa amount mismatch on payment ${payment.id} (receipt ${r.receipt}) — reconcile manually`);
        return null;
      }

      payment.status = "completed";
      payment.providerRef = r.receipt ?? null;
      payment.paidAt = r.transactionDate ?? new Date();
      if (r.phone) payment.phone = r.phone;
      payment.failureReason = null;
      await m.save(payment);

      const res = await this.orders.confirmAfterPayment(m, payment.orderId, `M-Pesa payment ${r.receipt ?? ""}`.trim());
      return { payment, change: res.change, orphaned: res.orphaned };
    });

    if (!outcome) return;
    this.orders.publish(outcome.change);
    this.events.emit(PaymentEvents.Completed, { paymentId: outcome.payment.id, orderId: outcome.payment.orderId, method: "mpesa" });
    if (outcome.orphaned) {
      this.logger.error(`Payment ${outcome.payment.id} (${outcome.payment.providerRef}) arrived for a cancelled order — refund or reinstate`);
      this.events.emit(PaymentEvents.Orphaned, { paymentId: outcome.payment.id, orderId: outcome.payment.orderId });
    }
  }

  /** Customer-triggered "I've paid" / poll: asks Daraja what happened to the prompt. */
  async verify(paymentId: string, actor: OrderActor) {
    const payment = await this.requireAccessible(paymentId, actor);
    await this.refreshFromDaraja(payment);
    return this.view(await this.payments.findOneByOrFail({ id: paymentId }));
  }

  async getStatus(paymentId: string, actor: OrderActor) {
    return this.view(await this.requireAccessible(paymentId, actor));
  }

  private async refreshFromDaraja(payment: Payment) {
    if (payment.method !== "mpesa" || payment.status !== "pending" || !payment.checkoutRequestId) return;
    if (!this.mpesa.isConfigured()) return;
    try {
      const q = await this.mpesa.stkQuery(payment.checkoutRequestId);
      await this.applyStkResult(
        {
          merchantRequestId: payment.merchantRequestId ?? "",
          checkoutRequestId: payment.checkoutRequestId,
          resultCode: q.resultCode,
          resultDesc: q.resultDesc,
        },
        null,
      );
    } catch (err) {
      if (err instanceof MpesaError && err.code === STK_STILL_PROCESSING) return; // customer hasn't answered yet
      this.logger.warn(`STK query failed for payment ${payment.id}: ${(err as Error).message}`);
    }
  }

  // Daraja callbacks do get lost. Every 2 minutes, ask about prompts that
  // should have resolved by now (they expire ~1-2 minutes after being sent).
  @Cron("*/2 * * * *")
  async reconcilePendingMpesa() {
    if (!this.mpesa.isConfigured()) return;
    const stale = await this.payments.find({
      where: {
        method: "mpesa",
        status: "pending",
        createdAt: And(LessThan(new Date(Date.now() - 2 * 60_000)), MoreThan(new Date(Date.now() - 60 * 60_000))),
      },
      order: { createdAt: "ASC" },
      take: 20,
    });
    for (const p of stale) await this.refreshFromDaraja(p);
  }

  // ---- Manual settlement (bank transfer, cash) ------------------------------------

  async adminConfirm(paymentId: string, reference: string | undefined, actorId: string) {
    const outcome = await this.dataSource.transaction(async (m) => {
      const payment = await m.findOne(Payment, { where: { id: paymentId }, lock: { mode: "pessimistic_write" } });
      if (!payment) throw new NotFoundException("Payment not found");
      if (payment.method !== "bank_transfer" && payment.method !== "cod") {
        throw new BadRequestException("Only bank transfer and cash payments are confirmed manually");
      }
      if (payment.status !== "pending") throw new ConflictException(`Payment is already ${payment.status}`);

      payment.status = "completed";
      payment.paidAt = new Date();
      if (reference) payment.providerRef = reference;
      await m.save(payment);

      const res = await this.orders.confirmAfterPayment(m, payment.orderId, `${payment.method} payment confirmed by staff`, actorId);
      return { payment, ...res };
    });

    this.orders.publish(outcome.change);
    this.events.emit(PaymentEvents.Completed, { paymentId, orderId: outcome.payment.orderId, method: outcome.payment.method });
    if (outcome.orphaned) this.events.emit(PaymentEvents.Orphaned, { paymentId, orderId: outcome.payment.orderId });
    return this.view(outcome.payment);
  }

  // Cash is collected by the courier, so a delivered COD order is a paid one.
  @OnEvent(OrderEvents.StatusChanged)
  async onOrderStatusChanged(change: OrderStatusChange) {
    if (change.to !== "delivered") return;
    try {
      const res = await this.payments.update(
        { orderId: change.orderId, method: "cod", status: "pending" },
        { status: "completed", paidAt: new Date() },
      );
      if (res.affected) this.events.emit(PaymentEvents.Completed, { orderId: change.orderId, method: "cod" });
    } catch (err) {
      this.logger.error(`Failed to settle COD payment for order ${change.orderId}: ${(err as Error).message}`);
    }
  }

  // ---- helpers ---------------------------------------------------------------------

  private async requireAccessible(paymentId: string, actor: OrderActor): Promise<Payment> {
    const payment = await this.payments.findOne({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException("Payment not found");
    await this.orders.getForActor(payment.orderId, actor); // throws 404 if the actor can't see the order
    return payment;
  }

  private view(p: Pick<Payment, "id" | "orderId" | "method" | "amount" | "status" | "providerRef" | "failureReason" | "paidAt" | "createdAt">) {
    return {
      id: p.id,
      orderId: p.orderId,
      method: p.method,
      amount: p.amount,
      status: p.status,
      providerRef: p.providerRef,
      failureReason: p.failureReason,
      paidAt: p.paidAt,
      createdAt: p.createdAt,
    };
  }
}
