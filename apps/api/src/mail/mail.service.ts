import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Env } from '../config/env';
import { MAIL_TRANSPORT, MailMessage, MailTransport } from './mail.transport';

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly from: string;
  private readonly webUrl: string;

  constructor(
    @Inject(MAIL_TRANSPORT) private readonly transport: MailTransport,
    config: ConfigService<Env, true>,
  ) {
    this.from = config.get('MAIL_FROM', { infer: true });
    this.webUrl = config.get('WEB_URL', { infer: true }).replace(/\/$/, '');
    this.logger.log(`Mail transport: ${transport.name}`);
  }

  async send(message: MailMessage): Promise<void> {
    try {
      await this.transport.send({ ...message, from: this.from });
    } catch (error) {
      // Mail failures must never break the calling request (e.g. registration).
      this.logger.error(`Failed to send "${message.subject}" to ${message.to}: ${(error as Error).message}`);
    }
  }

  async sendPasswordReset(to: string, name: string, token: string): Promise<void> {
    const link = `${this.webUrl}/reset-password?token=${encodeURIComponent(token)}`;
    await this.send({
      to,
      subject: 'Reset your LaunchPad password',
      text: `Hi ${name},\n\nWe received a request to reset your password. Open the link below to choose a new one:\n\n${link}\n\nIf you did not request this, you can safely ignore this email.`,
      html: `<p>Hi ${escapeHtml(name)},</p><p>We received a request to reset your password. Click the link below to choose a new one:</p><p><a href="${link}">${link}</a></p><p>If you did not request this, you can safely ignore this email.</p>`,
    });
  }

  async sendInvitation(to: string, organizationName: string, inviterName: string, token: string): Promise<void> {
    const link = `${this.webUrl}/invite/${encodeURIComponent(token)}`;
    await this.send({
      to,
      subject: `${inviterName} invited you to join ${organizationName} on LaunchPad`,
      text: `${inviterName} has invited you to collaborate in "${organizationName}".\n\nAccept the invitation:\n${link}\n\nThis link expires in a few days.`,
      html: `<p><strong>${escapeHtml(inviterName)}</strong> has invited you to collaborate in <strong>${escapeHtml(organizationName)}</strong>.</p><p><a href="${link}">Accept the invitation</a></p><p>This link expires in a few days.</p>`,
    });
  }

  async sendWelcome(to: string, name: string): Promise<void> {
    await this.send({
      to,
      subject: 'Welcome to LaunchPad',
      text: `Hi ${name},\n\nYour account is ready. Create your first workspace at ${this.webUrl}/app and start shipping.`,
    });
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
