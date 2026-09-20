import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";

// Validates the access token and attaches { id, email, roles } to req.user
// so RolesGuard and controllers can read it.
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_ACCESS_SECRET,
    });
  }

  async validate(payload: { sub: string; email: string; roles: string[] }) {
    return { id: payload.sub, email: payload.email, roles: payload.roles };
  }
}
