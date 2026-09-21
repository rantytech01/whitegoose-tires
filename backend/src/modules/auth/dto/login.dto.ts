import { IsEmail, IsOptional, IsString, Length } from "class-validator";

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;

  // Required only when the account has MFA enabled.
  @IsOptional()
  @IsString()
  @Length(6, 6)
  mfaCode?: string;
}
