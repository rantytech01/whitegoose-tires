import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { InventoryService } from "./inventory.service";
import { AdjustStockDto } from "./dto/adjust-stock.dto";
import { QueryInventoryDto } from "./dto/query-inventory.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";

@Controller("admin/inventory")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("super_admin", "branch_manager", "inventory_clerk")
export class InventoryController {
  constructor(private service: InventoryService) {}

  @Get()
  list(@Query() query: QueryInventoryDto) {
    return this.service.list(query);
  }

  // Declared before any `:param` route so it is not swallowed by it.
  @Get("reorder-alerts")
  reorderAlerts(@Query() query: QueryInventoryDto) {
    return this.service.list({ ...query, lowStock: true });
  }

  @Post("adjust")
  adjust(@Body() dto: AdjustStockDto, @CurrentUser() user: { id: string }) {
    return this.service.adjust(dto, user.id);
  }
}
