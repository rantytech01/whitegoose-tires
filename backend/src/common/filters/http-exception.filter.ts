import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { Request, Response } from "express";

// Centralizes error shape across the API so the frontend can rely on
// { statusCode, message, path, timestamp } for every error response
// (plus any structured fields the exception carried).
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload = exception instanceof HttpException ? exception.getResponse() : "Internal server error";

    if (status >= 500) {
      this.logger.error(`${request.method} ${request.url} -> ${status}`, exception instanceof Error ? exception.stack : String(exception));
    }

    // Flatten so clients always read `body.message` (string | string[]) and
    // any structured extras (e.g. `code`, `items` on stock conflicts) sit at
    // the top level rather than nested inside `message`.
    const body = typeof payload === "string" ? { message: payload } : (payload as Record<string, unknown>);

    response.status(status).json({
      ...body,
      statusCode: status,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
