import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { Env } from '../../config/env';
import { RedisService } from '../../redis/redis.service';
import { AuthenticatedRequest } from '../types/request';

/**
 * Fixed-window rate limiter backed by Redis. Buckets are keyed per user
 * (when authenticated) or per client IP. When Redis is unreachable the
 * guard fails open so a cache outage never turns into an API outage.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly windowSec: number;
  private readonly max: number;

  constructor(
    private readonly redis: RedisService,
    config: ConfigService<Env, true>,
  ) {
    this.windowSec = config.get('RATE_LIMIT_WINDOW_SEC', { infer: true });
    this.max = config.get('RATE_LIMIT_MAX', { infer: true });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest>();
    const response = http.getResponse<Response>();

    const subject = request.user?.id ?? request.ip ?? 'anonymous';
    const window = Math.floor(Date.now() / 1000 / this.windowSec);
    const key = `ratelimit:${subject}:${window}`;

    const result = await this.redis.incrWithTtl(key, this.windowSec);
    if (!result) return true;

    const remaining = Math.max(0, this.max - result.count);
    response.setHeader('X-RateLimit-Limit', this.max);
    response.setHeader('X-RateLimit-Remaining', remaining);
    response.setHeader('X-RateLimit-Reset', result.ttl);

    if (result.count > this.max) {
      response.setHeader('Retry-After', result.ttl);
      throw new HttpException('Too many requests, please slow down', HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}
