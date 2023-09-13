import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { buildValidationPipe, setupSwagger } from './app.setup';
import { Env } from './config/env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  const config = app.get(ConfigService<Env, true>);

  app.use(helmet({ contentSecurityPolicy: false }));
  app.enableCors({
    origin: config
      .get('CORS_ORIGIN', { infer: true })
      .split(',')
      .map((origin) => origin.trim()),
    credentials: true,
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Org-Id', 'X-LaunchPad-Signature'],
    exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
  });
  app.useGlobalPipes(buildValidationPipe());
  app.enableShutdownHooks();
  setupSwagger(app);

  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  Logger.log(`LaunchPad API listening on http://localhost:${port} (docs at /docs)`, 'Bootstrap');
}

void bootstrap();
