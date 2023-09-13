import { Logger } from '@nestjs/common';
import { MailMessage, MailTransport } from '../mail.transport';

/** Development transport: prints the message to the application log. */
export class ConsoleMailTransport implements MailTransport {
  readonly name = 'console';
  private readonly logger = new Logger('Mail');

  async send(message: MailMessage & { from: string }): Promise<void> {
    const divider = '-'.repeat(60);
    this.logger.log(
      [
        divider,
        `From:    ${message.from}`,
        `To:      ${message.to}`,
        `Subject: ${message.subject}`,
        '',
        message.text,
        divider,
      ].join('\n'),
    );
  }
}
