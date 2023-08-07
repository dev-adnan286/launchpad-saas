import { Membership, MembershipRole, Organization } from '@prisma/client';
import { Request } from 'express';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  createdAt: Date;
}

export interface AuthContext {
  /** 'jwt' when authenticated with an access token, 'api-key' when authenticated with lp_ key */
  method: 'jwt' | 'api-key';
  /** Organization the API key belongs to (api-key auth only) */
  apiKeyOrganizationId?: string;
  apiKeyId?: string;
}

export interface OrgContext {
  organization: Organization;
  membership: Membership;
}

export interface AuthenticatedRequest extends Request {
  user: AuthUser;
  auth: AuthContext;
  org?: Organization;
  membership?: Membership;
}

export const ROLE_RANK: Record<MembershipRole, number> = {
  OWNER: 4,
  ADMIN: 3,
  MEMBER: 2,
  VIEWER: 1,
};

export function roleAtLeast(actual: MembershipRole, required: MembershipRole): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}
