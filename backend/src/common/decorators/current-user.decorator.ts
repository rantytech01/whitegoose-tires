import { createParamDecorator, ExecutionContext } from "@nestjs/common";

// Pulls the JWT payload attached by JwtStrategy off the request.
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  return request.user;
});
