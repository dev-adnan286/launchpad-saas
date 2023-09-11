import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Env } from '../config/env';
import { MailerService } from './mail.service';
import { MAIL_TRANSPORT, MailTransport } from './mail.transport';
import { ConsoleMailTransport } from './transports/console.transport';
import { SmtpMailTransport } from './transports/smtp.transport';

@Global()
@Module({
  providers: [
    {
      provide: MAIL_TRANSPORT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): MailTransport => {
        const host = config.get('SMTP_HOST', { infer: true });
        if (host) {
          return new SmtpMailTransport({
            host,
            port: config.get('SMTP_PORT', { infer: true }),
            secure: config.get('SMTP_SECURE', { infer: true }),
            user: config.get('SMTP_USER', { infer: true }),
            pass: config.get('SMTP_PASS', { infer: true }),
          });
        }
        return new ConsoleMailTransport();
      },
    },
    MailerService,
  ],
  exports: [MailerService],
})
export class MailModule {}
