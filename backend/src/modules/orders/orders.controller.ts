import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { OrdersService } from "./orders.service";
import { CreateOrderDto } from "./dto/create-order.dto";
import { PaginationDto, TrackOrderDto } from "./dto/order-queries.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { OptionalJwtAuthGuard } from "../../common/guards/optional-jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { SessionId } from "../../common/decorators/session-id.decorator";

type MaybeUser = { id: string; roles?: string[] } | null;

@Controller("orders")
export class OrdersController {
  constructor(private service: OrdersService) {}

  // Turns the caller's cart into an order and reserves stock. Guests get a
  // one-time `guestToken` in the response: keep it, send it back as
  // `X-Order-Token` to view/pay for this order.
  @Post()
  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  create(
    @Body() dto: CreateOrderDto,
    @CurrentUser() user: MaybeUser,
    @SessionId() sessionId: string,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    if (idempotencyKey !== undefined && (idempotencyKey.length < 8 || idempotencyKey.length > 64)) {
      throw new BadRequestException("Idempotency-Key must be 8-64 characters");
    }
    return this.service.create({ userId: user?.id ?? null, sessionId }, dto, idempotencyKey);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  listMine(@CurrentUser() user: { id: string }, @Query() query: PaginationDto) {
    return this.service.listMine(user.id, query);
  }

  // Declared before ":id" so "track" isn't parsed as an order id.
  @Get("track")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  track(@Query() query: TrackOrderDto) {
    return this.service.track(query.orderNumber, query.phone);
  }

  @Get(":id")
  @UseGuards(OptionalJwtAuthGuard)
  findOne(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: MaybeUser,
    @Headers("x-order-token") orderToken?: string,
  ) {
    return this.service.findOneView(id, { userId: user?.id ?? null, roles: user?.roles ?? [], orderToken });
  }
}
