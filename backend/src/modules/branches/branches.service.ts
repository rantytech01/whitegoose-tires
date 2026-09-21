import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Branch } from "../../database/entities/branch.entity";
import { CreateBranchDto, UpdateBranchDto } from "./dto/branch.dto";

// Branch directory. Staff assignments and branch-level reporting arrive with
// the admin/reporting phases.
@Injectable()
export class BranchesService {
  constructor(@InjectRepository(Branch) private branches: Repository<Branch>) {}

  findActive() {
    return this.branches.find({ where: { isActive: true }, order: { name: "ASC" } });
  }

  findAll() {
    return this.branches.find({ order: { name: "ASC" } });
  }

  async findOne(id: number) {
    const branch = await this.branches.findOne({ where: { id } });
    if (!branch) throw new NotFoundException("Branch not found");
    return branch;
  }

  create(dto: CreateBranchDto) {
    return this.branches.save(this.branches.create(dto));
  }

  async update(id: number, dto: UpdateBranchDto) {
    const branch = await this.findOne(id);
    return this.branches.save(Object.assign(branch, dto));
  }
}
