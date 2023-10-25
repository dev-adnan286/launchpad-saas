import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Membership, Organization, PrismaClient } from '@prisma/client';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { AuthUser } from '../common/types/request';
import { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

export type PrismaMock = DeepMockProxy<PrismaClient>;

export function createPrismaMock(): PrismaMock {
  const prisma = mockDeep<PrismaClient>();
  // Default $transaction to awaiting the array of promises it receives.
  prisma.$transaction.mockImplementation(((operations: unknown) =>
    Array.isArray(operations) ? Promise.all(operations) : Promise.resolve(operations)));
  return prisma;
}

export function asPrismaService(mock: PrismaMock): PrismaService {
  return mock as unknown as PrismaService;
}

export const TEST_ENV: Env = {
  NODE_ENV: 'test',
  PORT: 4000,
  CORS_ORIGIN: 'http://localhost:3000',
  WEB_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://test',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'test-access-secret-0123456789abcdef',
  JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789abcdef',
  JWT_ACCESS_TTL: '15m',
  JWT_REFRESH_TTL: '7d',
  PASSWORD_RESET_TTL_MIN: 30,
  INVITATION_TTL_DAYS: 7,
  BILLING_WEBHOOK_SECRET: 'test-webhook-secret',
  MAIL_FROM: 'LaunchPad <no-reply@test.local>',
  SMTP_HOST: undefined,
  SMTP_PORT: 587,
  SMTP_USER: undefined,
  SMTP_PASS: undefined,
  SMTP_SECURE: false,
  RATE_LIMIT_WINDOW_SEC: 60,
  RATE_LIMIT_MAX: 120,
};

export function createConfigMock(overrides: Partial<Env> = {}): ConfigService<Env, true> {
  const values = { ...TEST_ENV, ...overrides };
  return {
    get: jest.fn((key: keyof Env) => values[key]),
    getOrThrow: jest.fn((key: keyof Env) => values[key]),
  } as unknown as ConfigService<Env, true>;
}

export interface RedisMock {
  store: Map<string, string>;
  service: RedisService;
}

/** In-memory stand-in for RedisService with the same surface used by the app. */
export function createRedisMock(available = true): RedisMock {
  const store = new Map<string, string>();
  const service = {
    isAvailable: jest.fn(() => available),
    ping: jest.fn(async () => available),
    get: jest.fn(async (key: string) => (available ? (store.get(key) ?? null) : null)),
    getJson: jest.fn(async (key: string) => {
      if (!available) return null;
      const raw = store.get(key);
      return raw ? JSON.parse(raw) : null;
    }),
    set: jest.fn(async (key: string, value: string) => {
      if (!available) return false;
      store.set(key, value);
      return true;
    }),
    setJson: jest.fn(async (key: string, value: unknown) => {
      if (!available) return false;
      store.set(key, JSON.stringify(value));
      return true;
    }),
    del: jest.fn(async (...keys: string[]) => {
      let removed = 0;
      for (const key of keys) if (store.delete(key)) removed += 1;
      return removed;
    }),
    incrWithTtl: jest.fn(async (key: string, ttl: number) => {
      if (!available) return null;
      const count = Number(store.get(key) ?? '0') + 1;
      store.set(key, String(count));
      return { count, ttl };
    }),
  } as unknown as RedisService;
  return { store, service };
}

export function createEventsMock(): EventEmitter2 {
  return { emit: jest.fn(() => true) } as unknown as EventEmitter2;
}

export const NOW = new Date('2026-06-01T12:00:00.000Z');

export function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'ada@example.com',
    name: 'Ada',
    avatarUrl: null,
    createdAt: NOW,
    ...overrides,
  };
}

export function makeOrganization(overrides: Partial<Organization> = {}): Organization {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Acme',
    slug: 'acme',
    ownerId: makeUser().id,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

export function makeMembership(overrides: Partial<Membership> = {}): Membership {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    userId: makeUser().id,
    organizationId: makeOrganization().id,
    role: 'OWNER',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}
