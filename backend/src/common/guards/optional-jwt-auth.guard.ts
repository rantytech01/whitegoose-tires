import { Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

// Like JwtAuthGuard, but anonymous requests pass through with req.user = null.
// Used on endpoints that serve both guests and signed-in customers
// (cart, guest checkout, order tracking).
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard("jwt") {
  handleRequest(_err: unknown, user: any) {
    return user || null;
  }
}
