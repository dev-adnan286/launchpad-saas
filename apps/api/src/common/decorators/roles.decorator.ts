import { SetMetadata } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Requires the caller's membership role to be at least the given role
 * (hierarchy: OWNER > ADMIN > MEMBER > VIEWER). When several roles are given,
 * the lowest one is the effective minimum.
 */
export const Roles = (...roles: MembershipRole[]) => SetMetadata(ROLES_KEY, roles);
