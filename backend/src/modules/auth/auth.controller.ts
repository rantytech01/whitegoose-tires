import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Request } from "express";
import { AuthService } from "./auth.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { VerifyOtpDto } from "./dto/verify-otp.dto";
import { RefreshTokenDto } from "./dto/refresh-token.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { MfaVerifyDto } from "./dto/mfa-verify.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { GoogleProfilePayload } from "./strategies/google.strategy";

@Controller("auth")
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post("register")
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post("verify-otp")
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }

  @Post("resend-otp")
  resendOtp(@Body("email") email: string) {
    return this.authService.resendOtp(email);
  }

  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get("google")
  @UseGuards(AuthGuard("google"))
  googleLogin() {
    // Redirect handled by passport-google-oauth20; nothing to return here.
  }

  @Get("google/callback")
  @UseGuards(AuthGuard("google"))
  async googleCallback(@Req() req: Request) {
    return this.authService.loginWithGoogle(req.user as GoogleProfilePayload);
  }

  @Post("refresh")
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post("logout")
  @UseGuards(JwtAuthGuard)
  logout(@CurrentUser() user: { id: string }, @Body() dto: RefreshTokenDto) {
    return this.authService.logout(user.id, dto.refreshToken);
  }

  @Post("forgot-password")
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post("reset-password")
  resetPassword(@Body("uid") userId: string, @Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(userId, dto);
  }

  @Post("mfa/enable")
  @UseGuards(JwtAuthGuard)
  enableMfa(@CurrentUser() user: { id: string }) {
    return this.authService.enableMfa(user.id);
  }

  @Post("mfa/verify")
  @UseGuards(JwtAuthGuard)
  verifyMfa(@CurrentUser() user: { id: string }, @Body() dto: MfaVerifyDto) {
    return this.authService.verifyMfa(user.id, dto.code);
  }
}
