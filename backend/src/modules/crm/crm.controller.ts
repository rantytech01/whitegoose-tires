import { Controller, Get, Param } from "@nestjs/common";
import { CrmService } from "./crm.service";

@Controller("admin/crm")
export class CrmController {
  constructor(private service: CrmService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.service.findOne(id);
  }
}
