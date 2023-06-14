import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { RefreshToken, User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { sha256 } from '../common/utils/crypto';
import { MailerService } from '../mail/mail.service';
import { asPrismaService, createConfigMock, createPrismaMock, NOW, PrismaMock } from '../testing/mocks';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let prisma: PrismaMock;
  let service: AuthService;
  let mailer: { sendWelcome: jest.Mock; sendPasswordReset: jest.Mock };
  const jwt = new JwtService({});

  const passwordHash = bcrypt.hashSync('Password123!', 4);
  const user: User = {
    id: 'user-1',
    email: 'ada@example.com',
    name: 'Ada',
    avatarUrl: null,
    passwordHash,
    createdAt: NOW,
    updatedAt: NOW,
  };

  beforeEach(() => {
    prisma = createPrismaMock();
    mailer = { sendWelcome: jest.fn().mockResolvedValue(undefined), sendPasswordReset: jest.fn().mockResolvedValue(undefined) };
    service = new AuthService(asPrismaService(prisma), jwt, mailer as unknown as MailerService, createConfigMock());
    prisma.refreshToken.create.mockImplementation((args) =>
      Promise.resolve({
        id: 'rt-1',
        revokedAt: null,
        createdAt: NOW,
        ...(args.data as object),
      } as RefreshToken) as never,
    );
  });

  describe('register', () => {
    it('creates the user, hashes the password and returns a token pair', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ ...user });

      const result = await service.register({ email: user.email, password: 'Password123!', name: 'Ada' });

      expect(result.user.email).toBe(user.email);
      expect(result.accessToken).toEqual(expect.any(String));
      expect(result.refreshToken).toEqual(expect.any(String));
      const createArgs = prisma.user.create.mock.calls[0][0];
      expect(createArgs.data.passwordHash).not.toBe('Password123!');
      expect(bcrypt.compareSync('Password123!', createArgs.data.passwordHash)).toBe(true);
      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
      expect(mailer.sendWelcome).toHaveBeenCalledWith(user.email, 'Ada');
    });

    it('rejects duplicate emails with 409', async () => {
      prisma.user.findUnique.mockResolvedValue(user);
      await expect(service.register({ email: user.email, password: 'Password123!', name: 'Ada' })).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('returns tokens for valid credentials', async () => {
      prisma.user.findUnique.mockResolvedValue(user);
      const result = await service.login({ email: user.email, password: 'Password123!' });
      expect(result.user).toEqual({ id: user.id, email: user.email, name: user.name, avatarUrl: null, createdAt: NOW });
      const payload = jwt.decode<{ sub: string; type: string }>(result.accessToken);
      expect(payload.sub).toBe(user.id);
      expect(payload.type).toBe('access');
    });

    it('rejects a wrong password', async () => {
      prisma.user.findUnique.mockResolvedValue(user);
      await expect(service.login({ email: user.email, password: 'nope' })).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an unknown email with the same error', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.login({ email: 'ghost@example.com', password: 'Password123!' })).rejects.toThrow(
        'Invalid email or password',
      );
    });
  });

  describe('refresh rotation', () => {
    async function issue(): Promise<{ refreshToken: string; stored: RefreshToken }> {
      prisma.user.findUnique.mockResolvedValue(user);
      const { refreshToken } = await service.login({ email: user.email, password: 'Password123!' });
      const stored = await prisma.refreshToken.create.mock.results[0].value;
      return { refreshToken, stored: stored as RefreshToken };
    }

    it('revokes the presented token and issues a new one in the same family', async () => {
      const { refreshToken, stored } = await issue();
      prisma.refreshToken.findUnique.mockResolvedValue(stored);
      prisma.refreshToken.update.mockResolvedValue({ ...stored, revokedAt: NOW });

      const rotated = await service.refresh(refreshToken);

      expect(rotated.refreshToken).not.toBe(refreshToken);
      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: stored.id },
        data: { revokedAt: expect.any(Date) },
      });
      const secondCreate = prisma.refreshToken.create.mock.calls[1][0];
      expect(secondCreate.data.familyId).toBe(stored.familyId);
      expect(secondCreate.data.tokenHash).toBe(sha256(rotated.refreshToken));
    });

    it('detects reuse of a revoked token and revokes the whole family', async () => {
      const { refreshToken, stored } = await issue();
      prisma.refreshToken.findUnique.mockResolvedValue({ ...stored, revokedAt: NOW });

      await expect(service.refresh(refreshToken)).rejects.toThrow('reuse detected');
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { familyId: stored.familyId, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
    });

    it('rejects a token that is not in the database', async () => {
      const { refreshToken } = await issue();
      prisma.refreshToken.findUnique.mockResolvedValue(null);
      await expect(service.refresh(refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an expired token', async () => {
      const { refreshToken, stored } = await issue();
      prisma.refreshToken.findUnique.mockResolvedValue({ ...stored, expiresAt: new Date(Date.now() - 1000) });
      await expect(service.refresh(refreshToken)).rejects.toThrow('expired');
    });

    it('rejects garbage or access tokens used as refresh tokens', async () => {
      await expect(service.refresh('not-a-jwt')).rejects.toBeInstanceOf(UnauthorizedException);
      const { accessToken } = await (async () => {
        prisma.user.findUnique.mockResolvedValue(user);
        return service.login({ email: user.email, password: 'Password123!' });
      })();
      await expect(service.refresh(accessToken)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('logout revokes the whole family and ignores unknown tokens', async () => {
      const { refreshToken, stored } = await issue();
      prisma.refreshToken.findUnique.mockResolvedValue(stored);
      await service.logout(refreshToken);
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { familyId: stored.familyId, revokedAt: null } }),
      );

      prisma.refreshToken.updateMany.mockClear();
      prisma.refreshToken.findUnique.mockResolvedValue(null);
      await service.logout('unknown');
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('password reset', () => {
    it('forgotPassword stores a hashed token and emails the plain one', async () => {
      prisma.user.findUnique.mockResolvedValue(user);
      prisma.passwordResetToken.create.mockResolvedValue({} as never);

      await service.forgotPassword(user.email);

      const plain = mailer.sendPasswordReset.mock.calls[0][2] as string;
      const createArgs = prisma.passwordResetToken.create.mock.calls[0][0];
      expect(createArgs.data.tokenHash).toBe(sha256(plain));
      expect(createArgs.data.tokenHash).not.toBe(plain);
      expect(prisma.passwordResetToken.updateMany).toHaveBeenCalled();
    });

    it('forgotPassword silently succeeds for unknown emails', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.forgotPassword('ghost@example.com')).resolves.toBeUndefined();
      expect(mailer.sendPasswordReset).not.toHaveBeenCalled();
    });

    it('resetPassword updates the hash, consumes the token and revokes sessions', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'prt-1',
        userId: user.id,
        tokenHash: sha256('plain-token'),
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: null,
        createdAt: NOW,
      });
      prisma.user.update.mockResolvedValue(user);
      prisma.passwordResetToken.update.mockResolvedValue({} as never);
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 2 });

      await service.resetPassword('plain-token', 'NewPassword456!');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const updateArgs = prisma.user.update.mock.calls[0][0];
      expect(bcrypt.compareSync('NewPassword456!', updateArgs.data.passwordHash as string)).toBe(true);
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('resetPassword rejects used or expired tokens', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'prt-1',
        userId: user.id,
        tokenHash: 'x',
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: NOW,
        createdAt: NOW,
      });
      await expect(service.resetPassword('t', 'NewPassword456!')).rejects.toBeInstanceOf(UnauthorizedException);

      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'prt-2',
        userId: user.id,
        tokenHash: 'x',
        expiresAt: new Date(Date.now() - 1),
        usedAt: null,
        createdAt: NOW,
      });
      await expect(service.resetPassword('t', 'NewPassword456!')).rejects.toThrow('invalid or has expired');
    });
  });

  describe('changePassword', () => {
    it('requires the current password', async () => {
      prisma.user.findUnique.mockResolvedValue(user);
      await expect(
        service.changePassword(user.id, { currentPassword: 'wrong', newPassword: 'NewPassword456!' }),
      ).rejects.toThrow('Current password is incorrect');
    });

    it('updates the hash and revokes sessions', async () => {
      prisma.user.findUnique.mockResolvedValue(user);
      prisma.user.update.mockResolvedValue(user);
      await service.changePassword(user.id, { currentPassword: 'Password123!', newPassword: 'NewPassword456!' });
      expect(prisma.user.update).toHaveBeenCalled();
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: user.id, revokedAt: null } }),
      );
    });
  });
});
