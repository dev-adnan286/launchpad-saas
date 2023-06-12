import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ApiKey } from '@prisma/client';
import { sha256 } from '../common/utils/crypto';
import { asPrismaService, createEventsMock, createPrismaMock, NOW, PrismaMock } from '../testing/mocks';
import {
  API_KEY_PREFIX,
  ApiKeysService,
  derivePrefix,
  generatePlainKey,
  hashApiKey,
  isApiKeyFormat,
} from './api-keys.service';

const ORG = 'org-1';
const creator = { id: 'user-1', email: 'ada@example.com', name: 'Ada', avatarUrl: null, createdAt: NOW };

function makeKey(plain: string, overrides: Partial<ApiKey> = {}): ApiKey & { createdBy: typeof creator } {
  return {
    id: 'key-1',
    organizationId: ORG,
    createdById: creator.id,
    name: 'CI',
    prefix: derivePrefix(plain),
    keyHash: hashApiKey(plain),
    lastUsedAt: null,
    expiresAt: null,
    revokedAt: null,
    createdAt: NOW,
    createdBy: creator,
    ...overrides,
  };
}

describe('api key helpers', () => {
  it('generates lp_-prefixed keys of fixed length that hash with sha256', () => {
    const plain = generatePlainKey();
    expect(plain.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(plain).toHaveLength(43);
    expect(isApiKeyFormat(plain)).toBe(true);
    expect(hashApiKey(plain)).toBe(sha256(plain));
    expect(derivePrefix(plain)).toBe(plain.slice(0, 11));
  });

  it('generates unique keys', () => {
    const keys = new Set(Array.from({ length: 50 }, () => generatePlainKey()));
    expect(keys.size).toBe(50);
  });

  it('rejects malformed key strings', () => {
    expect(isApiKeyFormat('lp_short')).toBe(false);
    expect(isApiKeyFormat('sk_' + 'a'.repeat(40))).toBe(false);
    expect(isApiKeyFormat('')).toBe(false);
  });
});

describe('ApiKeysService', () => {
  let prisma: PrismaMock;
  let service: ApiKeysService;
  let events: ReturnType<typeof createEventsMock>;

  beforeEach(() => {
    prisma = createPrismaMock();
    events = createEventsMock();
    service = new ApiKeysService(asPrismaService(prisma), events);
  });

  it('create returns the plain key exactly once and stores only its hash', async () => {
    prisma.apiKey.create.mockImplementation((args) => Promise.resolve(makeKey('x', args.data as object)) as never);

    const { apiKey, plainKey } = await service.create(ORG, creator.id, { name: 'CI' });

    const stored = prisma.apiKey.create.mock.calls[0][0].data;
    expect(stored.keyHash).toBe(hashApiKey(plainKey));
    expect(stored.prefix).toBe(derivePrefix(plainKey));
    expect(JSON.stringify(apiKey)).not.toContain(plainKey);
    expect(apiKey).not.toHaveProperty('keyHash');
    expect(events.emit).toHaveBeenCalledWith('api_key.created', expect.objectContaining({ entityType: 'api_key' }));
  });

  it('create honours an expiry date', async () => {
    prisma.apiKey.create.mockImplementation((args) => Promise.resolve(makeKey('x', args.data as object)) as never);
    const { apiKey } = await service.create(ORG, creator.id, { name: 'temp', expiresAt: '2027-01-01T00:00:00.000Z' });
    expect(apiKey.expiresAt).toEqual(new Date('2027-01-01T00:00:00.000Z'));
  });

  describe('verify', () => {
    const plain = generatePlainKey();

    it('accepts a valid key, stamps lastUsedAt and returns the creator as the acting user', async () => {
      prisma.apiKey.findUnique.mockResolvedValue(makeKey(plain));
      prisma.apiKey.update.mockResolvedValue(makeKey(plain, { lastUsedAt: NOW }));

      const result = await service.verify(plain);

      expect(result.user.id).toBe(creator.id);
      expect(result.apiKey.organizationId).toBe(ORG);
      expect(prisma.apiKey.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { keyHash: hashApiKey(plain) } }));
      expect(prisma.apiKey.update).toHaveBeenCalledWith({ where: { id: 'key-1' }, data: { lastUsedAt: expect.any(Date) } });
    });

    it('rejects unknown keys without leaking whether they exist', async () => {
      prisma.apiKey.findUnique.mockResolvedValue(null);
      await expect(service.verify(plain)).rejects.toThrow('Invalid API key');
    });

    it('rejects revoked keys', async () => {
      prisma.apiKey.findUnique.mockResolvedValue(makeKey(plain, { revokedAt: NOW }));
      await expect(service.verify(plain)).rejects.toThrow('revoked');
      expect(prisma.apiKey.update).not.toHaveBeenCalled();
    });

    it('rejects expired keys', async () => {
      prisma.apiKey.findUnique.mockResolvedValue(makeKey(plain, { expiresAt: new Date(Date.now() - 1) }));
      await expect(service.verify(plain)).rejects.toThrow('expired');
    });

    it('rejects malformed input before hitting the database', async () => {
      await expect(service.verify('lp_nope')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.apiKey.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('revoke', () => {
    it('sets revokedAt and emits an event', async () => {
      prisma.apiKey.findFirst.mockResolvedValue(makeKey('x'));
      prisma.apiKey.update.mockResolvedValue(makeKey('x', { revokedAt: NOW }));
      const result = await service.revoke(ORG, creator.id, 'key-1');
      expect(result.revokedAt).toEqual(NOW);
      expect(events.emit).toHaveBeenCalledWith('api_key.revoked', expect.anything());
    });

    it('is idempotent for already revoked keys', async () => {
      prisma.apiKey.findFirst.mockResolvedValue(makeKey('x', { revokedAt: NOW }));
      await service.revoke(ORG, creator.id, 'key-1');
      expect(prisma.apiKey.update).not.toHaveBeenCalled();
    });

    it('404s for keys of other organizations', async () => {
      prisma.apiKey.findFirst.mockResolvedValue(null);
      await expect(service.revoke(ORG, creator.id, 'key-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.apiKey.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'key-1', organizationId: ORG } }));
    });
  });

  it('list never exposes hashes', async () => {
    prisma.apiKey.findMany.mockResolvedValue([makeKey('x')] as never);
    const [view] = await service.list(ORG);
    expect(view).toEqual({
      id: 'key-1',
      name: 'CI',
      prefix: expect.any(String),
      lastUsedAt: null,
      expiresAt: null,
      revokedAt: null,
      createdAt: NOW,
      createdBy: { id: creator.id, email: creator.email, name: creator.name, avatarUrl: null, createdAt: NOW },
    });
    expect(view).not.toHaveProperty('keyHash');
  });
});
