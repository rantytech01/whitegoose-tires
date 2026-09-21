import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, MoreThan, IsNull } from "typeorm";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import * as crypto from "crypto";
import { authenticator } from "otplib";
import { User } from "../../database/entities/user.entity";
import { Role } from "../../database/entities/role.entity";
import { RefreshToken } from "../../database/entities/refresh-token.entity";
import { PasswordResetToken } from "../../database/entities/password-reset-token.entity";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { VerifyOtpDto } from "./dto/verify-otp.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { NotificationsStub } from "./notifications.stub";
import { GoogleProfilePayload } from "./strategies/google.strategy";

const OTP_TTL_MINUTES = 10;
const RESET_TTL_MINUTES = 30;

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private users: Repository<User>,
    @InjectRepository(Role) private roles: Repository<Role>,
    @InjectRepository(RefreshToken) private refreshTokens: Repository<RefreshToken>,
    @InjectRepository(PasswordResetToken) private resetTokens: Repository<PasswordResetToken>,
    private jwt: JwtService,
    private notifications: NotificationsStub,
  ) {}

  // ---- registration + OTP verification ----

  async register(dto: RegisterDto) {
    const existing = await this.users.findOne({ where: { email: dto.email } });
    if (existing) throw new ConflictException("An account with this email already exists");

    const customerRole = await this.roles.findOne({ where: { name: "customer" } });
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const { code, hash, expiresAt } = await this.generateOtp();

    const user = this.users.create({
      email: dto.email,
      phone: dto.phone ?? null,
      passwordHash,
      fullName: dto.fullName,
      userType: "customer",
      roles: customerRole ? [customerRole] : [],
      otpCodeHash: hash,
      otpExpiresAt: expiresAt,
    });
    await this.users.save(user);
    await this.notifications.sendOtp(dto.phone ?? dto.email, code);

    return { message: "Registered. Verify the OTP sent to activate your account.", email: dto.email };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const user = await this.users.findOne({ where: { email: dto.email } });
    if (!user || !user.otpCodeHash || !user.otpExpiresAt) {
      throw new BadRequestException("No pending verification for this account");
    }
    if (user.otpExpiresAt < new Date()) throw new BadRequestException("OTP has expired — request a new one");

    const valid = await bcrypt.compare(dto.code, user.otpCodeHash);
    if (!valid) throw new BadRequestException("Invalid OTP");

    user.emailVerifiedAt = new Date();
    user.otpCodeHash = null;
    user.otpExpiresAt = null;
    await this.users.save(user);

    return this.issueTokens(user);
  }

  async resendOtp(email: string) {
    const user = await this.users.findOne({ where: { email } });
    if (!user) return { message: "If the account exists, a new OTP has been sent." };

    const { code, hash, expiresAt } = await this.generateOtp();
    user.otpCodeHash = hash;
    user.otpExpiresAt = expiresAt;
    await this.users.save(user);
    await this.notifications.sendOtp(user.phone ?? user.email, code);
    return { message: "If the account exists, a new OTP has been sent." };
  }

  // ---- login ----

  async login(dto: LoginDto) {
    const user = await this.users.findOne({ where: { email: dto.email } });
    if (!user || !user.passwordHash) throw new UnauthorizedException("Invalid credentials");
    if (!user.isActive) throw new UnauthorizedException("Account is disabled");

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException("Invalid credentials");

    if (user.mfaEnabled) {
      if (!dto.mfaCode) throw new UnauthorizedException("MFA code required");
      const validMfa = authenticator.check(dto.mfaCode, user.mfaSecret ?? "");
      if (!validMfa) throw new UnauthorizedException("Invalid MFA code");
    }

    return this.issueTokens(user);
  }

  async loginWithGoogle(profile: GoogleProfilePayload) {
    if (!profile.email) throw new BadRequestException("Google account has no email");

    let user = await this.users.findOne({ where: [{ googleId: profile.googleId }, { email: profile.email }] });
    if (!user) {
      const customerRole = await this.roles.findOne({ where: { name: "customer" } });
      user = this.users.create({
        email: profile.email,
        fullName: profile.fullName ?? profile.email,
        userType: "customer",
        googleId: profile.googleId,
        emailVerifiedAt: new Date(),
        roles: customerRole ? [customerRole] : [],
      });
    } else if (!user.googleId) {
      user.googleId = profile.googleId;
    }
    await this.users.save(user);

    return this.issueTokens(user);
  }

  // ---- refresh ----

  async refresh(rawToken: string) {
    let payload: { sub: string };
    try {
      payload = this.jwt.verify(rawToken, { secret: process.env.JWT_REFRESH_SECRET });
    } catch {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    const candidates = await this.refreshTokens.find({
      where: { userId: payload.sub, revokedAt: IsNull(), expiresAt: MoreThan(new Date()) },
    });
    const match = await this.findMatchingToken(candidates, rawToken);
    if (!match) throw new UnauthorizedException("Refresh token not recognized");

    match.revokedAt = new Date();
    await this.refreshTokens.save(match);

    const user = await this.users.findOne({ where: { id: payload.sub } });
    if (!user || !user.isActive) throw new UnauthorizedException("Account no longer active");

    return this.issueTokens(user);
  }

  async logout(userId: string, rawToken: string) {
    const candidates = await this.refreshTokens.find({ where: { userId, revokedAt: IsNull() } });
    const match = await this.findMatchingToken(candidates, rawToken);
    if (match) {
      match.revokedAt = new Date();
      await this.refreshTokens.save(match);
    }
    return { message: "Logged out" };
  }

  // ---- password reset ----

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.users.findOne({ where: { email: dto.email } });
    // Always return the same message — don't leak whether the email exists.
    if (!user) return { message: "If the account exists, a reset link has been sent." };

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = await bcrypt.hash(rawToken, 12);
    const resetRecord = this.resetTokens.create({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60_000),
    });
    await this.resetTokens.save(resetRecord);

    // The frontend route that will call /auth/reset-password with this token.
    const resetUrl = `${process.env.FRONTEND_URL ?? "http://localhost:3000"}/reset-password?uid=${user.id}&token=${rawToken}`;
    await this.notifications.sendPasswordResetLink(user.email, resetUrl);

    return { message: "If the account exists, a reset link has been sent." };
  }

  async resetPassword(userId: string, dto: ResetPasswordDto) {
    const candidates = await this.resetTokens.find({
      where: { userId, usedAt: IsNull(), expiresAt: MoreThan(new Date()) },
    });
    let match: PasswordResetToken | null = null;
    for (const candidate of candidates) {
      if (await bcrypt.compare(dto.token, candidate.tokenHash)) {
        match = candidate;
        break;
      }
    }
    if (!match) throw new BadRequestException("Invalid or expired reset token");

    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new BadRequestException("Invalid or expired reset token");

    user.passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.users.save(user);

    match.usedAt = new Date();
    await this.resetTokens.save(match);

    // Revoke every existing session — a password reset should log out all devices.
    await this.refreshTokens.update({ userId, revokedAt: IsNull() }, { revokedAt: new Date() });

    return { message: "Password updated. Please log in again." };
  }

  // ---- MFA ----

  async enableMfa(userId: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new BadRequestException("User not found");

    const secret = authenticator.generateSecret();
    user.mfaSecret = secret;
    user.mfaEnabled = false; // not active until confirmed via verify
    await this.users.save(user);

    const otpauthUrl = authenticator.keyuri(user.email, "WhiteGoose Tires", secret);
    return { secret, otpauthUrl };
  }

  async verifyMfa(userId: string, code: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user || !user.mfaSecret) throw new BadRequestException("MFA setup not started");

    const valid = authenticator.check(code, user.mfaSecret);
    if (!valid) throw new BadRequestException("Invalid MFA code");

    user.mfaEnabled = true;
    await this.users.save(user);
    return { message: "MFA enabled" };
  }

  // ---- helpers ----

  private async generateOtp() {
    const code = String(crypto.randomInt(100000, 999999));
    const hash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000);
    return { code, hash, expiresAt };
  }

  private async findMatchingToken<T extends { tokenHash: string }>(candidates: T[], rawToken: string) {
    for (const candidate of candidates) {
      if (await bcrypt.compare(rawToken, candidate.tokenHash)) return candidate;
    }
    return null;
  }

  private async issueTokens(user: User) {
    const roleNames = (user.roles ?? []).map((r) => r.name);
    const payload = { sub: user.id, email: user.email, roles: roleNames };

    const accessToken = this.jwt.sign(payload, {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: process.env.JWT_ACCESS_EXPIRY ?? "15m",
    });
    const refreshToken = this.jwt.sign({ sub: user.id }, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: process.env.JWT_REFRESH_EXPIRY ?? "7d",
    });

    const tokenHash = await bcrypt.hash(refreshToken, 12);
    const decoded = this.jwt.decode(refreshToken) as { exp: number };
    await this.refreshTokens.save(
      this.refreshTokens.create({
        userId: user.id,
        tokenHash,
        expiresAt: new Date(decoded.exp * 1000),
      }),
    );

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        userType: user.userType,
        roles: roleNames,
      },
    };
  }
}
