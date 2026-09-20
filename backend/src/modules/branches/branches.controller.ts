import { Controller, Get, Param } from "@nestjs/common";
import { BranchesService } from "./branches.service";

@Controller("branches")
export class BranchesController {
  constructor(private service: BranchesService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.service.findOne(id);
  }
}
