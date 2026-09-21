import { PartialType } from "@nestjs/mapped-types";
import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateBranchDto {
  @IsString() @MaxLength(80) name: string;
  @IsOptional() @IsString() @MaxLength(255) address?: string;
  @IsOptional() @IsString() @MaxLength(60) city?: string;
  @IsOptional() @IsString() @MaxLength(20) phone?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateBranchDto extends PartialType(CreateBranchDto) {}
