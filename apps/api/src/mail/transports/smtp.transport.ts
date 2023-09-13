import { Logger } from '@nestjs/common';
import * as net from 'node:net';
import * as tls from 'node:tls';
import { MailMessage, MailTransport } from '../mail.transport';

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
}

/**
 * Minimal dependency-free SMTP client (EHLO / AUTH LOGIN / MAIL FROM / RCPT TO / DATA / QUIT).
 * It supports implicit TLS (SMTP_SECURE=true, typically port 465) and plaintext sessions
 * (port 25/587 without STARTTLS). Swap it for a nodemailer-based transport if you need
 * STARTTLS negotiation, attachments or connection pooling.
 */
export class SmtpMailTransport implements MailTransport {
  readonly name = 'smtp';
  private readonly logger = new Logger('SmtpMail');

  constructor(private readonly config: SmtpConfig) {
    if (!config.host) throw new Error('SMTP transport requires a host');
  }

  async send(message: MailMessage & { from: string }): Promise<void> {
    const socket = await this.connect();
    const session = new SmtpSession(socket);
    try {
      await session.expect(220);
      await session.command('EHLO launchpad.local', 250);
      if (this.config.user && this.config.pass) {
        await session.command('AUTH LOGIN', 334);
        await session.command(Buffer.from(this.config.user).toString('base64'), 334);
        await session.command(Buffer.from(this.config.pass).toString('base64'), 235);
      }
      await session.command(`MAIL FROM:<${extractAddress(message.from)}>`, 250);
      await session.command(`RCPT TO:<${extractAddress(message.to)}>`, [250, 251]);
      await session.command('DATA', 354);
      await session.command(this.buildData(message), 250);
      await session.command('QUIT', 221);
      this.logger.log(`Sent "${message.subject}" to ${message.to}`);
    } finally {
      socket.end();
    }
  }

  private connect(): Promise<net.Socket> {
    return new Promise((resolve, reject) => {
      const onError = (error: Error) => reject(error);
      if (this.config.secure) {
        const socket = tls.connect({ host: this.config.host, port: this.config.port, servername: this.config.host }, () =>
          resolve(socket),
        );
        socket.once('error', onError);
      } else {
        const socket = net.connect({ host: this.config.host, port: this.config.port }, () => resolve(socket));
        socket.once('error', onError);
      }
    });
  }

  private buildData(message: MailMessage & { from: string }): string {
    const boundary = `lp-${Date.now().toString(36)}`;
    const headers = [
      `From: ${message.from}`,
      `To: ${message.to}`,
      `Subject: ${message.subject}`,
      `Date: ${new Date().toUTCString()}`,
      'MIME-Version: 1.0',
    ];
    let body: string;
    if (message.html) {
      headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
      body = [
        `--${boundary}`,
        'Content-Type: text/plain; charset=utf-8',
        '',
        message.text,
        `--${boundary}`,
        'Content-Type: text/html; charset=utf-8',
        '',
        message.html,
        `--${boundary}--`,
      ].join('\r\n');
    } else {
      headers.push('Content-Type: text/plain; charset=utf-8');
      body = message.text;
    }
    // Dot-stuffing per RFC 5321 section 4.5.2, then terminate with <CRLF>.<CRLF>
    const stuffed = body.replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..');
    return `${headers.join('\r\n')}\r\n\r\n${stuffed}\r\n.`;
  }
}

function extractAddress(value: string): string {
  const match = /<([^>]+)>/.exec(value);
  return match ? match[1] : value.trim();
}

class SmtpSession {
  private buffer = '';
  private waiters: Array<{ resolve: (line: string) => void; reject: (error: Error) => void }> = [];

  constructor(private readonly socket: net.Socket) {
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => this.onData(chunk));
    socket.on('error', (error: Error) => this.flush(error));
    socket.on('close', () => this.flush(new Error('SMTP connection closed')));
  }

  async command(line: string, expected: number | number[]): Promise<void> {
    this.socket.write(`${line}\r\n`);
    await this.expect(expected);
  }

  async expect(expected: number | number[]): Promise<void> {
    const reply = await this.nextReply();
    const code = Number(reply.slice(0, 3));
    const allowed = Array.isArray(expected) ? expected : [expected];
    if (!allowed.includes(code)) {
      throw new Error(`Unexpected SMTP reply: ${reply.trim()}`);
    }
  }

  private nextReply(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.waiters.push({ resolve, reject });
      this.drain();
    });
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    this.drain();
  }

  /** Multi-line replies use "250-" continuation lines and end with "250 ". */
  private drain(): void {
    while (this.waiters.length > 0) {
      const match = /^(\d{3})([ -])(.*)\r?\n/m.exec(this.buffer);
      if (!match) return;
      const endIndex = this.buffer.indexOf('\n', match.index) + 1;
      const line = this.buffer.slice(match.index, endIndex);
      this.buffer = this.buffer.slice(endIndex);
      if (match[2] === '-') continue;
      const waiter = this.waiters.shift();
      waiter?.resolve(line);
    }
  }

  private flush(error: Error): void {
    const pending = this.waiters;
    this.waiters = [];
    for (const waiter of pending) waiter.reject(error);
  }
}
