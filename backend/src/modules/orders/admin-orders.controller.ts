import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query, UseGuards } from "@nestjs/common";
import { OrdersService, STAFF_ROLES } from "./orders.service";
import { QueryOrdersDto, UpdateOrderStatusDto } from "./dto/order-queries.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { OrderStatus } from "../../database/entities/order.entity";

// TODO(branches): branch_manager / sales_staff should only see their own
// branch's orders once staff_assignments exists.
@Controller("admin/orders")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...STAFF_ROLES)
export class AdminOrdersController {
  constructor(private service: OrdersService) {}

  @Get()
  list(@Query() query: QueryOrdersDto) {
    return this.service.listAll(query);
  }

  @Get(":id")
  findOne(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: { id: string; roles: string[] }) {
    return this.service.findOneView(id, { userId: user.id, roles: user.roles });
  }

  @Patch(":id/status")
  updateStatus(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.adminUpdateStatus(id, dto.status as OrderStatus, dto.note, user.id);
  }
}
