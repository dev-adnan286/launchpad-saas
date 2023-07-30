import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const started = process.hrtime.bigint();

    return next.handle().pipe(
      tap({
        next: () => this.log(request, response.statusCode, started),
        error: (error: unknown) => {
          const status = typeof (error as { status?: number }).status === 'number' ? (error as { status: number }).status : 500;
          this.log(request, status, started);
        },
      }),
    );
  }

  private log(request: Request, status: number, started: bigint): void {
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1_000_000;
    const line = `${request.method} ${request.originalUrl} ${status} ${elapsedMs.toFixed(1)}ms`;
    if (status >= 500) this.logger.error(line);
    else if (status >= 400) this.logger.warn(line);
    else this.logger.log(line);
  }
}
