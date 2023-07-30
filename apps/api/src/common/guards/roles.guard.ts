import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MembershipRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthenticatedRequest, ROLE_RANK, roleAtLeast } from '../types/request';

/**
 * Enforces `@Roles(...)` using the hierarchy OWNER > ADMIN > MEMBER > VIEWER.
 * Must run after OrgMemberGuard (relies on `req.membership`).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<MembershipRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const membership = request.membership;
    if (!membership) {
      throw new ForbiddenException('Organization membership required');
    }

    const minimum = required.reduce((lowest, role) => (ROLE_RANK[role] < ROLE_RANK[lowest] ? role : lowest));
    if (!roleAtLeast(membership.role, minimum)) {
      throw new ForbiddenException(`This action requires the ${minimum} role or higher`);
    }
    return true;
  }
}
