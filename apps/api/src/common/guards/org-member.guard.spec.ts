import { BadRequestException, ExecutionContext, ForbiddenException } from '@nestjs/common';
import {
  asPrismaService,
  createPrismaMock,
  createRedisMock,
  makeMembership,
  makeOrganization,
  makeUser,
  PrismaMock,
} from '../../testing/mocks';
import { AuthenticatedRequest } from '../types/request';
import { membershipCacheKey, OrgMemberGuard } from './org-member.guard';

function contextFor(request: Partial<AuthenticatedRequest>): { ctx: ExecutionContext; request: AuthenticatedRequest } {
  const full = { headers: {}, params: {}, ...request } as AuthenticatedRequest;
  const ctx = { switchToHttp: () => ({ getRequest: () => full }) } as unknown as ExecutionContext;
  return { ctx, request: full };
}

describe('OrgMemberGuard', () => {
  let prisma: PrismaMock;
  let redis: ReturnType<typeof createRedisMock>;
  let guard: OrgMemberGuard;
  const user = makeUser();
  const organization = makeOrganization();
  const membership = makeMembership({ role: 'ADMIN' });

  beforeEach(() => {
    prisma = createPrismaMock();
    redis = createRedisMock(true);
    guard = new OrgMemberGuard(asPrismaService(prisma), redis.service);
  });

  it('resolves the org from the X-Org-Id header and attaches org + membership', async () => {
    prisma.membership.findUnique.mockResolvedValue({ ...membership, organization } as never);
    const { ctx, request } = contextFor({ user, auth: { method: 'jwt' }, headers: { 'x-org-id': organization.id } });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);

    expect(request.org).toEqual(organization);
    expect(request.membership).toEqual(membership);
    expect(prisma.membership.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId_organizationId: { userId: user.id, organizationId: organization.id } } }),
    );
  });

  it('prefers the orgId route param over the header', async () => {
    prisma.membership.findUnique.mockResolvedValue({ ...membership, organization } as never);
    const { ctx } = contextFor({
      user,
      auth: { method: 'jwt' },
      headers: { 'x-org-id': 'other' },
      params: { orgId: organization.id },
    });
    await guard.canActivate(ctx);
    expect(prisma.membership.findUnique.mock.calls[0][0].where.userId_organizationId?.organizationId).toBe(organization.id);
  });

  it('serves a cache hit without querying and revives dates', async () => {
    await redis.service.setJson(membershipCacheKey(user.id, organization.id), { organization, membership });
    const { ctx, request } = contextFor({ user, auth: { method: 'jwt' }, headers: { 'x-org-id': organization.id } });

    await guard.canActivate(ctx);

    expect(prisma.membership.findUnique).not.toHaveBeenCalled();
    expect(request.org?.createdAt).toBeInstanceOf(Date);
    expect(request.membership?.role).toBe('ADMIN');
  });

  it('writes the resolved context to the cache with a TTL', async () => {
    prisma.membership.findUnique.mockResolvedValue({ ...membership, organization } as never);
    const { ctx } = contextFor({ user, auth: { method: 'jwt' }, headers: { 'x-org-id': organization.id } });
    await guard.canActivate(ctx);
    expect(redis.service.setJson).toHaveBeenCalledWith(membershipCacheKey(user.id, organization.id), expect.anything(), 60);
  });

  it('still works when Redis is unavailable', async () => {
    guard = new OrgMemberGuard(asPrismaService(prisma), createRedisMock(false).service);
    prisma.membership.findUnique.mockResolvedValue({ ...membership, organization } as never);
    const { ctx } = contextFor({ user, auth: { method: 'jwt' }, headers: { 'x-org-id': organization.id } });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('400s when no organization context is provided', async () => {
    const { ctx } = contextFor({ user, auth: { method: 'jwt' } });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('403s for non-members', async () => {
    prisma.membership.findUnique.mockResolvedValue(null);
    const { ctx } = contextFor({ user, auth: { method: 'jwt' }, headers: { 'x-org-id': organization.id } });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('403s when an API key is used against a different organization', async () => {
    const { ctx } = contextFor({
      user,
      auth: { method: 'api-key', apiKeyOrganizationId: 'org-of-key' },
      headers: { 'x-org-id': organization.id },
    });
    await expect(guard.canActivate(ctx)).rejects.toThrow('API key does not belong');
    expect(prisma.membership.findUnique).not.toHaveBeenCalled();
  });

  it('403s when unauthenticated', async () => {
    const { ctx } = contextFor({ headers: { 'x-org-id': organization.id } });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
