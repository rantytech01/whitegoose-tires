import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy, VerifyCallback } from "passport-google-oauth20";

export interface GoogleProfilePayload {
  googleId: string;
  email: string;
  fullName: string;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, "google") {
  constructor() {
    super({
      clientID: process.env.GOOGLE_CLIENT_ID ?? "unset",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "unset",
      callbackURL: process.env.GOOGLE_CALLBACK_URL ?? "http://localhost:4000/api/v1/auth/google/callback",
      scope: ["email", "profile"],
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<void> {
    const payload: GoogleProfilePayload = {
      googleId: profile.id,
      email: profile.emails?.[0]?.value,
      fullName: profile.displayName,
    };
    done(null, payload);
  }
}
