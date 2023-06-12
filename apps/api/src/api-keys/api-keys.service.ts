import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ApiKey } from '@prisma/client';
import { ActivityEvent } from '../activity/activity.events';
import { randomBase62, safeEqual, sha256 } from '../common/utils/crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateApiKeyDto } from './dto/api-key.dto';

export const API_KEY_PREFIX = 'lp_';
const KEY_BODY_LENGTH = 40;
const PREFIX_DISPLAY_LENGTH = 8;

export interface ApiKeyView {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  createdBy: { id: string; name: string };
}

export interface ApiKeyCreated {
  apiKey: ApiKeyView;
  plainKey: string;
}

export interface VerifiedApiKey {
  apiKey: ApiKey;
  user: { id: string; email: string; name: string; avatarUrl: string | null; createdAt: Date };
}

const keyInclude = { createdBy: { select: { id: true, name: true } } } as const;

/** Splits a plain key into its public prefix (stored for display/lookup) and computes its hash. */
export function derivePrefix(plainKey: string): string {
  return plainKey.slice(0, API_KEY_PREFIX.length + PREFIX_DISPLAY_LENGTH);
}

export function hashApiKey(plainKey: string): string {
  return sha256(plainKey);
}

export function generatePlainKey(): string {
  return `${API_KEY_PREFIX}${randomBase62(KEY_BODY_LENGTH)}`;
}

export function isApiKeyFormat(value: string): boolean {
  return value.startsWith(API_KEY_PREFIX) && value.length === API_KEY_PREFIX.length + KEY_BODY_LENGTH;
}

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async list(organizationId: string): Promise<ApiKeyView[]> {
    const keys = await this.prisma.apiKey.findMany({
      where: { organizationId },
      include: keyInclude,
      orderBy: { createdAt: 'desc' },
    });
    return keys.map((key) => this.toView(key));
  }

  async create(organizationId: string, actorId: string, dto: CreateApiKeyDto): Promise<ApiKeyCreated> {
    const plainKey = generatePlainKey();
    const created = await this.prisma.apiKey.create({
      data: {
        organizationId,
        createdById: actorId,
        name: dto.name,
        prefix: derivePrefix(plainKey),
        keyHash: hashApiKey(plainKey),
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
      include: keyInclude,
    });

    this.emit({
      organizationId,
      actorId,
      entityType: 'api_key',
      entityId: created.id,
      action: 'api_key.created',
      metadata: { name: created.name, prefix: created.prefix },
    });

    return { apiKey: this.toView(created), plainKey };
  }

  async revoke(organizationId: string, actorId: string, id: string): Promise<ApiKeyView> {
    const existing = await this.prisma.apiKey.findFirst({ where: { id, organizationId }, include: keyInclude });
    if (!existing) throw new NotFoundException('API key not found');
    if (existing.revokedAt) return this.toView(existing);

    const revoked = await this.prisma.apiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
      include: keyInclude,
    });
    this.emit({
      organizationId,
      actorId,
      entityType: 'api_key',
      entityId: id,
      action: 'api_key.revoked',
      metadata: { name: revoked.name },
    });
    return this.toView(revoked);
  }

  /**
   * Validates a plain key presented in the Authorization header. Looks the key up by its
   * hash, re-checks it in constant time, rejects revoked/expired keys and stamps lastUsedAt.
   */
  async verify(plainKey: string): Promise<VerifiedApiKey> {
    if (!isApiKeyFormat(plainKey)) {
      throw new UnauthorizedException('Malformed API key');
    }
    const keyHash = hashApiKey(plainKey);
    const record = await this.prisma.apiKey.findUnique({
      where: { keyHash },
      include: {
        createdBy: { select: { id: true, email: true, name: true, avatarUrl: true, createdAt: true } },
      },
    });
    if (!record || !safeEqual(record.keyHash, keyHash)) {
      throw new UnauthorizedException('Invalid API key');
    }
    if (record.revokedAt) {
      throw new UnauthorizedException('API key has been revoked');
    }
    if (record.expiresAt && record.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('API key has expired');
    }

    await this.prisma.apiKey.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } });

    const { createdBy, ...apiKey } = record;
    return { apiKey, user: createdBy };
  }

  private toView(key: ApiKey & { createdBy: { id: string; name: string } }): ApiKeyView {
    return {
      id: key.id,
      name: key.name,
      prefix: key.prefix,
      lastUsedAt: key.lastUsedAt,
      expiresAt: key.expiresAt,
      revokedAt: key.revokedAt,
      createdAt: key.createdAt,
      createdBy: key.createdBy,
    };
  }

  private emit(event: ActivityEvent): void {
    this.events.emit(event.action, event);
  }
}
