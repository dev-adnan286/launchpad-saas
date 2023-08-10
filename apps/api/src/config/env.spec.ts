import { parseDurationToSeconds, validateEnv } from './env';

const base = {
  DATABASE_URL: 'postgresql://x',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  BILLING_WEBHOOK_SECRET: 'webhook-secret',
};

describe('env validation', () => {
  it('applies defaults and coerces numbers', () => {
    const env = validateEnv({ ...base, PORT: '5001', SMTP_SECURE: 'true' });
    expect(env.PORT).toBe(5001);
    expect(env.JWT_ACCESS_TTL).toBe('15m');
    expect(env.RATE_LIMIT_MAX).toBe(120);
    expect(env.SMTP_SECURE).toBe(true);
    expect(env.NODE_ENV).toBe('development');
  });

  it('lists every offending key', () => {
    expect(() => validateEnv({ JWT_ACCESS_SECRET: 'short' })).toThrow(/DATABASE_URL[\s\S]*JWT_ACCESS_SECRET[\s\S]*JWT_REFRESH_SECRET/);
  });

  it('rejects unknown NODE_ENV values', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });
});

describe('parseDurationToSeconds', () => {
  it.each([
    ['15m', 900],
    ['7d', 604800],
    ['2h', 7200],
    ['45s', 45],
    ['30', 30],
  ])('%s -> %d', (input, expected) => {
    expect(parseDurationToSeconds(input)).toBe(expected);
  });

  it('throws on garbage', () => {
    expect(() => parseDurationToSeconds('soon')).toThrow(/Invalid duration/);
  });
});
