import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { SkipThrottle, Throttle } from "@nestjs/throttler";
import { PaymentsService } from "./payments.service";
import { ConfirmPaymentDto, PayOrderDto } from "./dto/payments.dto";
import { OptionalJwtAuthGuard } from "../../common/guards/optional-jwt-auth.guard";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { STAFF_ROLES } from "../orders/orders.service";

type MaybeUser = { id: string; roles?: string[] } | null;
const actorOf = (user: MaybeUser, orderToken?: string) => ({ userId: user?.id ?? null, roles: user?.roles ?? [], orderToken });

@Controller()
export class PaymentsController {
  constructor(private service: PaymentsService) {}

  // Starts a payment for an order: M-Pesa STK prompt, COD, or bank-transfer
  // instructions. Tight limit: an STK push is an SMS-like prompt to someone's phone.
  @Post("orders/:id/pay")
  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  pay(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: PayOrderDto,
    @CurrentUser() user: MaybeUser,
    @Headers("x-order-token") orderToken?: string,
  ) {
    return this.service.initiate(id, actorOf(user, orderToken), dto);
  }

  // The checkout page polls this after the STK prompt is sent.
  @Get("payments/:id")
  @UseGuards(OptionalJwtAuthGuard)
  status(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: MaybeUser,
    @Headers("x-order-token") orderToken?: string,
  ) {
    return this.service.getStatus(id, actorOf(user, orderToken));
  }

  // Asks Daraja directly; recovers payments whose callback was lost.
  @Post("payments/:id/verify")
  @HttpCode(200)
  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verify(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: MaybeUser,
    @Headers("x-order-token") orderToken?: string,
  ) {
    return this.service.verify(id, actorOf(user, orderToken));
  }
}

@Controller("admin/payments")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...STAFF_ROLES)
export class AdminPaymentsController {
  constructor(private service: PaymentsService) {}

  // Bank transfer received / cash banked.
  @Post(":id/confirm")
  @HttpCode(200)
  confirm(@Param("id", ParseUUIDPipe) id: string, @Body() dto: ConfirmPaymentDto, @CurrentUser() user: { id: string }) {
    return this.service.adminConfirm(id, dto.reference, user.id);
  }
}

// Safaricom -> us. Public by necessity: authenticated by the secret in the URL.
@Controller("webhooks/mpesa")
@SkipThrottle()
export class MpesaWebhookController {
  constructor(private service: PaymentsService) {}

  @Post("callback/:secret")
  @HttpCode(200)
  async callback(@Param("secret") secret: string, @Body() body: unknown) {
    await this.service.handleMpesaCallback(secret, body);
    return { ResultCode: 0, ResultDesc: "Accepted" };
  }
}
