import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { GoogleStrategy } from "./strategies/google.strategy";
import { NotificationsStub } from "./notifications.stub";
import { User } from "../../database/entities/user.entity";
import { Role } from "../../database/entities/role.entity";
import { RefreshToken } from "../../database/entities/refresh-token.entity";
import { PasswordResetToken } from "../../database/entities/password-reset-token.entity";

@Module({
  imports: [
    PassportModule,
    JwtModule.register({}),
    TypeOrmModule.forFeature([User, Role, RefreshToken, PasswordResetToken]),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, GoogleStrategy, NotificationsStub],
  exports: [AuthService],
})
export class AuthModule {}
