import { createParamDecorator, ExecutionContext, InternalServerErrorException } from '@nestjs/common';
import { AuthenticatedRequest, OrgContext } from '../types/request';

/**
 * Injects the resolved organization + membership (set by OrgMemberGuard).
 * Throws if used on a route that isn't guarded, which is a programming error.
 */
export const CurrentOrg = createParamDecorator(
  (field: keyof OrgContext | undefined, ctx: ExecutionContext): OrgContext | OrgContext[keyof OrgContext] => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.org || !request.membership) {
      throw new InternalServerErrorException('CurrentOrg used without OrgMemberGuard');
    }
    const context: OrgContext = { organization: request.org, membership: request.membership };
    return field ? context[field] : context;
  },
);
