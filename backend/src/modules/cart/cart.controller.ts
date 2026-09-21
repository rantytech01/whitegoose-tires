import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from "@nestjs/common";
import { CartService } from "./cart.service";
import { AddCartItemDto, SaveForLaterDto, UpdateCartItemDto } from "./dto/cart.dto";
import { OptionalJwtAuthGuard } from "../../common/guards/optional-jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { SessionId } from "../../common/decorators/session-id.decorator";

type MaybeUser = { id: string } | null;

// Works for guests (session cookie / X-Cart-Session) and signed-in customers.
@Controller("cart")
@UseGuards(OptionalJwtAuthGuard)
export class CartController {
  constructor(private service: CartService) {}

  @Get()
  get(@CurrentUser() user: MaybeUser, @SessionId() sessionId: string) {
    return this.service.getCart({ userId: user?.id ?? null, sessionId });
  }

  @Post("items")
  add(@Body() dto: AddCartItemDto, @CurrentUser() user: MaybeUser, @SessionId() sessionId: string) {
    return this.service.addItem({ userId: user?.id ?? null, sessionId }, dto.productId, dto.quantity);
  }

  @Patch("items/:productId")
  update(
    @Param("productId", ParseUUIDPipe) productId: string,
    @Body() dto: UpdateCartItemDto,
    @CurrentUser() user: MaybeUser,
    @SessionId() sessionId: string,
  ) {
    return this.service.updateQuantity({ userId: user?.id ?? null, sessionId }, productId, dto.quantity);
  }

  @Patch("items/:productId/save-for-later")
  saveForLater(
    @Param("productId", ParseUUIDPipe) productId: string,
    @Body() dto: SaveForLaterDto,
    @CurrentUser() user: MaybeUser,
    @SessionId() sessionId: string,
  ) {
    return this.service.setSavedForLater({ userId: user?.id ?? null, sessionId }, productId, dto.saved);
  }

  @Delete("items/:productId")
  remove(
    @Param("productId", ParseUUIDPipe) productId: string,
    @CurrentUser() user: MaybeUser,
    @SessionId() sessionId: string,
  ) {
    return this.service.removeItem({ userId: user?.id ?? null, sessionId }, productId);
  }
}
