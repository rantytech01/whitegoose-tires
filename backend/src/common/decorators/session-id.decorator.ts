import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { Request, Response } from "express";

export const CART_SESSION_COOKIE = "wg_session";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

// Resolves the guest session id for cart/checkout. Web clients get an httpOnly
// cookie; native/mobile clients (no cookie jar) can send `X-Cart-Session`
// with the id returned in the cart response instead.
export const SessionId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const http = ctx.switchToHttp();
  const req = http.getRequest<Request>();
  const res = http.getResponse<Response>();

  const header = req.headers["x-cart-session"];
  const candidate = (typeof header === "string" ? header : undefined) ?? readCookie(req.headers.cookie, CART_SESSION_COOKIE);
  if (candidate && UUID_RE.test(candidate)) return candidate;

  const id = randomUUID();
  res.cookie(CART_SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: "/",
  });
  return id;
});
