import { Controller, Get, Param } from "@nestjs/common";
import { ReportsService } from "./reports.service";

@Controller("admin/reports")
export class ReportsController {
  constructor(private service: ReportsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.service.findOne(id);
  }
}
