import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Envelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

/**
 * Returns true when the handler already produced an envelope (`{ data, meta? }`),
 * in which case it is passed through untouched (used for paginated responses).
 */
export function isEnvelope(value: unknown): value is Envelope<unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  if (!keys.includes('data')) return false;
  return keys.every((key) => key === 'data' || key === 'meta');
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, Envelope<T>> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<Envelope<T>> {
    return next.handle().pipe(
      map((value) => {
        if (isEnvelope(value)) return value as Envelope<T>;
        return { data: value === undefined ? null : value } as Envelope<T>;
      }),
    );
  }
}
