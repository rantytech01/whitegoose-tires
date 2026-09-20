import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";

// TODO: replace the in-memory placeholders with the UsersRepository
// (TypeORM repo over the `users` table) once the database module lands.
@Injectable()
export class AuthService {
  constructor(private jwt: JwtService) {}

  async register(dto: RegisterDto) {
    const passwordHash = await bcrypt.hash(dto.password, 12);
    // TODO: persist user, send OTP via SMS/email provider
    return { message: "Registered. Verify OTP to activate your account.", email: dto.email };
  }

  async login(dto: LoginDto) {
    // TODO: look up user, compare bcrypt hash
    const valid = true; // placeholder
    if (!valid) throw new UnauthorizedException("Invalid credentials");

    const payload = { sub: "user-id-placeholder", email: dto.email, roles: ["customer"] };
    return {
      accessToken: this.jwt.sign(payload, {
        secret: process.env.JWT_ACCESS_SECRET,
        expiresIn: process.env.JWT_ACCESS_EXPIRY ?? "15m",
      }),
      refreshToken: this.jwt.sign(payload, {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: process.env.JWT_REFRESH_EXPIRY ?? "7d",
      }),
    };
  }
}
