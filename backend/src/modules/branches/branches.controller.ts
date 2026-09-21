import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, UseGuards } from "@nestjs/common";
import { BranchesService } from "./branches.service";
import { CreateBranchDto, UpdateBranchDto } from "./dto/branch.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";

// Public: branch locations for pickup/delivery selection.
@Controller("branches")
export class BranchesController {
  constructor(private service: BranchesService) {}

  @Get()
  findAll() {
    return this.service.findActive();
  }
}

// Maps to the `branches.write` permission in the schema doc.
@Controller("admin/branches")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("super_admin", "branch_manager")
export class AdminBranchesController {
  constructor(private service: BranchesService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Post()
  create(@Body() dto: CreateBranchDto) {
    return this.service.create(dto);
  }

  @Put(":id")
  update(@Param("id", ParseIntPipe) id: number, @Body() dto: UpdateBranchDto) {
    return this.service.update(id, dto);
  }
}
