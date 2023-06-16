import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { ApiKeysService, API_KEY_PREFIX } from '../../api-keys/api-keys.service';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { AuthenticatedRequest } from '../../common/types/request';

/**
 * Global authentication guard. Order of resolution:
 *  1. `@Public()` routes pass through.
 *  2. `Authorization: Bearer lp_...` is verified as an API key (acts as the key creator).
 *  3. Otherwise the bearer token is validated as a JWT access token via passport.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly reflector: Reflector,
    private readonly apiKeys: ApiKeysService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const bearer = extractBearer(request);

    if (bearer?.startsWith(API_KEY_PREFIX)) {
      const verified = await this.apiKeys.verify(bearer);
      request.user = verified.user;
      request.auth = {
        method: 'api-key',
        apiKeyId: verified.apiKey.id,
        apiKeyOrganizationId: verified.apiKey.organizationId,
      };
      return true;
    }

    const ok = (await super.canActivate(context)) as boolean;
    if (!ok) throw new UnauthorizedException();
    request.auth = { method: 'jwt' };
    return true;
  }
}

export function extractBearer(request: Request): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (!/^Bearer$/i.test(scheme) || !token) return null;
  return token.trim();
}
