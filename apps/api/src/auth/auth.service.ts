import { ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { AuthUser } from '../common/types/request';
import { randomToken, sha256 } from '../common/utils/crypto';
import { Env, parseDurationToSeconds } from '../config/env';
import { MailerService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { ChangePasswordDto, LoginDto, RegisterDto } from './dto/auth.dto';
import { AccessTokenPayload } from './strategies/jwt.strategy';

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
  fam: string;
  type: 'refresh';
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse extends TokenPair {
  user: AuthUser;
}

const BCRYPT_ROUNDS = 10;
const userSelect = { id: true, email: true, name: true, avatarUrl: true, createdAt: true } as const;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly accessTtlSec: number;
  private readonly refreshTtlSec: number;
  private readonly resetTtlMin: number;
  private readonly accessSecret: string;
  private readonly refreshSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mailer: MailerService,
    config: ConfigService<Env, true>,
  ) {
    this.accessTtlSec = parseDurationToSeconds(config.get('JWT_ACCESS_TTL', { infer: true }));
    this.refreshTtlSec = parseDurationToSeconds(config.get('JWT_REFRESH_TTL', { infer: true }));
    this.resetTtlMin = config.get('PASSWORD_RESET_TTL_MIN', { infer: true });
    this.accessSecret = config.get('JWT_ACCESS_SECRET', { infer: true });
    this.refreshSecret = config.get('JWT_REFRESH_SECRET', { infer: true });
  }

  // ───────────────────────── Registration & login ─────────────────────────

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }
    const passwordHash = await this.hashPassword(dto.password);
    const user = await this.prisma.user.create({
      data: { email: dto.email, name: dto.name, passwordHash },
      select: userSelect,
    });
    void this.mailer.sendWelcome(user.email, user.name);
    const tokens = await this.issueTokenPair(user.id, user.email, randomUUID());
    return { user, ...tokens };
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    // Always run a comparison to keep timing consistent whether or not the user exists.
    const hash = user?.passwordHash ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
    const valid = await bcrypt.compare(dto.password, hash);
    if (!user || !valid) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const tokens = await this.issueTokenPair(user.id, user.email, randomUUID());
    return { user: this.toAuthUser(user), ...tokens };
  }

  // ───────────────────────── Refresh rotation ─────────────────────────

  /**
   * Rotates a refresh token. Each login creates a token "family"; every refresh revokes the
   * presented token and issues a new one in the same family. If a token that was already
   * revoked is presented again, we assume it leaked and revoke the entire family.
   */
  async refresh(refreshToken: string): Promise<TokenPair> {
    const payload = await this.verifyRefreshToken(refreshToken);
    const tokenHash = sha256(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!stored || stored.userId !== payload.sub) {
      throw new UnauthorizedException('Refresh token not recognized');
    }

    if (stored.revokedAt) {
      this.logger.warn(`Refresh token reuse detected for user ${stored.userId}; revoking family ${stored.familyId}`);
      await this.prisma.refreshToken.updateMany({
        where: { familyId: stored.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token reuse detected; please sign in again');
    }

    if (stored.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const user = await this.prisma.user.findUnique({ where: { id: stored.userId }, select: userSelect });
    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }

    await this.prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
    return this.issueTokenPair(user.id, user.email, stored.familyId);
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = sha256(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored) return;
    await this.prisma.refreshToken.updateMany({
      where: { familyId: stored.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllSessions(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // ───────────────────────── Password reset ─────────────────────────

  /** Always resolves, regardless of whether the email exists, to avoid account enumeration. */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return;

    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const token = randomToken(32);
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + this.resetTtlMin * 60_000),
      },
    });
    await this.mailer.sendPasswordReset(user.email, user.name, token);
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Reset link is invalid or has expired');
    }
    const passwordHash = await this.hashPassword(newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      this.prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      this.prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    const passwordHash = await this.hashPassword(dto.newPassword);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    await this.revokeAllSessions(userId);
  }

  // ───────────────────────── Helpers ─────────────────────────

  async hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, BCRYPT_ROUNDS);
  }

  private async issueTokenPair(userId: string, email: string, familyId: string): Promise<TokenPair> {
    const accessPayload: AccessTokenPayload = { sub: userId, email, type: 'access' };
    const refreshPayload: RefreshTokenPayload = { sub: userId, jti: randomUUID(), fam: familyId, type: 'refresh' };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(accessPayload, { secret: this.accessSecret, expiresIn: this.accessTtlSec }),
      this.jwt.signAsync(refreshPayload, { secret: this.refreshSecret, expiresIn: this.refreshTtlSec }),
    ]);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash: sha256(refreshToken),
        expiresAt: new Date(Date.now() + this.refreshTtlSec * 1000),
      },
    });

    return { accessToken, refreshToken };
  }

  private async verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
    try {
      const payload = await this.jwt.verifyAsync<RefreshTokenPayload>(token, { secret: this.refreshSecret });
      if (payload.type !== 'refresh') throw new Error('wrong type');
      return payload;
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private toAuthUser(user: { id: string; email: string; name: string; avatarUrl: string | null; createdAt: Date }): AuthUser {
    return { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl, createdAt: user.createdAt };
  }
}
