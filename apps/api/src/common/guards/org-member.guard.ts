import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Membership, Organization } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { AuthenticatedRequest } from '../types/request';

export const ORG_HEADER = 'x-org-id';
export const MEMBERSHIP_CACHE_TTL_SEC = 60;

interface CachedOrgContext {
  organization: Organization;
  membership: Membership;
}

export function membershipCacheKey(userId: string, organizationId: string): string {
  return `membership:${userId}:${organizationId}`;
}

/**
 * Resolves the organization for the request (route param `orgId` or `X-Org-Id` header),
 * verifies the caller is a member, and attaches `req.org` + `req.membership`.
 * Membership lookups are cached in Redis for 60s and invalidated on role changes.
 */
@Injectable()
export class OrgMemberGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) {
      throw new ForbiddenException('Authentication required');
    }

    const organizationId = this.resolveOrganizationId(request);
    const resolved = await this.resolve(request.user.id, organizationId);
    if (!resolved) {
      throw new ForbiddenException('You are not a member of this organization');
    }

    request.org = resolved.organization;
    request.membership = resolved.membership;
    return true;
  }

  private resolveOrganizationId(request: AuthenticatedRequest): string {
    const params = request.params as Record<string, string | undefined>;
    const headerValue = request.headers[ORG_HEADER];
    const fromHeader = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    const fromParam = params.orgId;
    const candidate = fromParam ?? fromHeader;

    if (!candidate) {
      throw new BadRequestException(`Organization context missing: provide the ${ORG_HEADER.toUpperCase()} header`);
    }

    const apiKeyOrg = request.auth?.apiKeyOrganizationId;
    if (apiKeyOrg && apiKeyOrg !== candidate) {
      throw new ForbiddenException('API key does not belong to this organization');
    }
    return candidate;
  }

  private async resolve(userId: string, organizationId: string): Promise<CachedOrgContext | null> {
    const key = membershipCacheKey(userId, organizationId);
    const cached = await this.redis.getJson<CachedOrgContext>(key);
    if (cached) {
      return this.revive(cached);
    }

    const membership = await this.prisma.membership.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
      include: { organization: true },
    });
    if (!membership) return null;

    const { organization, ...rest } = membership;
    const value: CachedOrgContext = { organization, membership: rest };
    await this.redis.setJson(key, value, MEMBERSHIP_CACHE_TTL_SEC);
    return value;
  }

  /** JSON round-trips turn Dates into strings; restore them so downstream code sees real Dates. */
  private revive(value: CachedOrgContext): CachedOrgContext {
    return {
      organization: {
        ...value.organization,
        createdAt: new Date(value.organization.createdAt),
        updatedAt: new Date(value.organization.updatedAt),
      },
      membership: {
        ...value.membership,
        createdAt: new Date(value.membership.createdAt),
        updatedAt: new Date(value.membership.updatedAt),
      },
    };
  }
}
