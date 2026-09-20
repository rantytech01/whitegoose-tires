import { Controller, Get, Param } from "@nestjs/common";
import { InventoryService } from "./inventory.service";

@Controller("admin/inventory")
export class InventoryController {
  constructor(private service: InventoryService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.service.findOne(id);
  }
}
