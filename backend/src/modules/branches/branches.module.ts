import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AdminBranchesController, BranchesController } from "./branches.controller";
import { BranchesService } from "./branches.service";
import { Branch } from "../../database/entities/branch.entity";

@Module({
  imports: [TypeOrmModule.forFeature([Branch])],
  controllers: [BranchesController, AdminBranchesController],
  providers: [BranchesService],
  exports: [BranchesService],
})
export class BranchesModule {}
