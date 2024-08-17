/**
 * E2E environment defaults. CI provides DATABASE_URL / REDIS_URL through service containers;
 * everything else gets deterministic test values so the suite never depends on a local .env.
 */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://launchpad:launchpad@localhost:5432/launchpad_test?schema=public';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'e2e-access-secret-0123456789abcdef';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'e2e-refresh-secret-0123456789abcdef';
process.env.BILLING_WEBHOOK_SECRET = process.env.BILLING_WEBHOOK_SECRET ?? 'e2e-webhook-secret';
process.env.JWT_ACCESS_TTL = '15m';
process.env.JWT_REFRESH_TTL = '7d';
process.env.RATE_LIMIT_MAX = '10000';
process.env.CORS_ORIGIN = 'http://localhost:3000';
process.env.WEB_URL = 'http://localhost:3000';
