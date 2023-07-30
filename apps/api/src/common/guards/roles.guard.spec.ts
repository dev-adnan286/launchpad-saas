import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MembershipRole } from '@prisma/client';
import { makeMembership } from '../../testing/mocks';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { roleAtLeast } from '../types/request';
import { RolesGuard } from './roles.guard';

function contextWith(role: MembershipRole | null, required: MembershipRole[] | undefined): ExecutionContext {
  const request = role ? { membership: makeMembership({ role }) } : {};
  const handler = () => undefined;
  class Controller {}
  if (required) Reflect.defineMetadata(ROLES_KEY, required, handler);
  return {
    getHandler: () => handler,
    getClass: () => Controller,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  it('allows routes without @Roles', () => {
    expect(guard.canActivate(contextWith('VIEWER', undefined))).toBe(true);
    expect(guard.canActivate(contextWith('VIEWER', []))).toBe(true);
  });

  it.each<[MembershipRole, MembershipRole, boolean]>([
    ['OWNER', 'ADMIN', true],
    ['ADMIN', 'ADMIN', true],
    ['MEMBER', 'ADMIN', false],
    ['VIEWER', 'MEMBER', false],
    ['MEMBER', 'MEMBER', true],
    ['ADMIN', 'OWNER', false],
    ['OWNER', 'OWNER', true],
    ['VIEWER', 'VIEWER', true],
  ])('%s accessing a %s route -> %s', (actual, required, allowed) => {
    const ctx = contextWith(actual, [required]);
    if (allowed) {
      expect(guard.canActivate(ctx)).toBe(true);
    } else {
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    }
  });

  it('uses the lowest role when several are listed', () => {
    expect(guard.canActivate(contextWith('MEMBER', ['ADMIN', 'MEMBER']))).toBe(true);
    expect(() => guard.canActivate(contextWith('VIEWER', ['ADMIN', 'MEMBER']))).toThrow(/MEMBER role or higher/);
  });

  it('fails when OrgMemberGuard did not run', () => {
    expect(() => guard.canActivate(contextWith(null, ['MEMBER']))).toThrow('Organization membership required');
  });

  it('roleAtLeast follows the hierarchy', () => {
    expect(roleAtLeast('OWNER', 'VIEWER')).toBe(true);
    expect(roleAtLeast('VIEWER', 'OWNER')).toBe(false);
  });
});
