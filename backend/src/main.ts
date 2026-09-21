import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { ValidationPipe } from "@nestjs/common";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Behind Nginx/Cloudflare req.ip must come from X-Forwarded-For, otherwise every
  // client shares the proxy's IP and rate limiting punishes everyone at once.
  // Set TRUST_PROXY_HOPS to the number of proxies in front of the API.
  app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS ?? 1));

  app.use(helmet());
  // Credentials (the guest cart cookie) require an explicit origin; "*" is rejected by browsers.
  app.enableCors({ origin: process.env.CORS_ORIGIN?.split(",") ?? ["http://localhost:3000"], credentials: true });
  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());

  await app.listen(process.env.PORT ?? 4000);
}
bootstrap();
