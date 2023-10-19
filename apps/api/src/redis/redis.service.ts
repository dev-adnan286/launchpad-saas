import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { Env } from '../config/env';

/**
 * Thin wrapper around ioredis that treats Redis as an optional accelerator.
 * Every operation swallows connectivity errors and returns a "miss" so callers can
 * fall back to the database. This keeps local development possible without Redis.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;
  private available = false;
  private warned = false;

  constructor(config: ConfigService<Env, true>) {
    this.client = new Redis(config.get('REDIS_URL', { infer: true }), {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      enableOfflineQueue: false,
      retryStrategy: (times) => Math.min(times * 500, 5000),
    });

    this.client.on('ready', () => {
      this.available = true;
      this.warned = false;
      this.logger.log('Redis connection established');
    });
    this.client.on('end', () => {
      this.available = false;
    });
    this.client.on('error', (error: Error) => {
      this.available = false;
      if (!this.warned) {
        this.warned = true;
        this.logger.warn(`Redis unavailable (${error.message}); running in degraded mode`);
      }
    });

    this.client.connect().catch(() => {
      // handled by the 'error' listener above
    });
  }

  isAvailable(): boolean {
    return this.available;
  }

  async ping(): Promise<boolean> {
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async get(key: string): Promise<string | null> {
    return this.safely(() => this.client.get(key), null);
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.get(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
    return this.safely(async () => {
      if (ttlSeconds && ttlSeconds > 0) {
        await this.client.set(key, value, 'EX', ttlSeconds);
      } else {
        await this.client.set(key, value);
      }
      return true;
    }, false);
  }

  async setJson(key: string, value: unknown, ttlSeconds?: number): Promise<boolean> {
    return this.set(key, JSON.stringify(value), ttlSeconds);
  }

  async del(...keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;
    return this.safely(() => this.client.del(...keys), 0);
  }

  /**
   * Atomically increments a counter and applies the TTL on first creation.
   * Returns null when Redis is unavailable so rate limiting can fail open.
   */
  async incrWithTtl(key: string, ttlSeconds: number): Promise<{ count: number; ttl: number } | null> {
    return this.safely(async () => {
      const results = await this.client
        .multi()
        .incr(key)
        .ttl(key)
        .exec();
      if (!results) return null;
      const count = Number(results[0][1]);
      let ttl = Number(results[1][1]);
      if (ttl < 0) {
        await this.client.expire(key, ttlSeconds);
        ttl = ttlSeconds;
      }
      return { count, ttl };
    }, null);
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }

  private async safely<T>(operation: () => Promise<T>, fallback: T): Promise<T> {
    if (!this.available) return fallback;
    try {
      return await operation();
    } catch (error) {
      this.logger.debug(`Redis operation failed: ${(error as Error).message}`);
      return fallback;
    }
  }
}
