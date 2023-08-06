import { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { isEnvelope, TransformInterceptor } from './transform.interceptor';

describe('TransformInterceptor', () => {
  const interceptor = new TransformInterceptor<unknown>();
  const ctx = {} as ExecutionContext;
  const handler = (value: unknown): CallHandler => ({ handle: () => of(value) });

  it('wraps plain objects in { data }', async () => {
    await expect(lastValueFrom(interceptor.intercept(ctx, handler({ id: 1 })))).resolves.toEqual({ data: { id: 1 } });
  });

  it('wraps arrays and primitives', async () => {
    await expect(lastValueFrom(interceptor.intercept(ctx, handler([1, 2])))).resolves.toEqual({ data: [1, 2] });
    await expect(lastValueFrom(interceptor.intercept(ctx, handler('ok')))).resolves.toEqual({ data: 'ok' });
    await expect(lastValueFrom(interceptor.intercept(ctx, handler(0)))).resolves.toEqual({ data: 0 });
  });

  it('turns undefined into null so the envelope is always present', async () => {
    await expect(lastValueFrom(interceptor.intercept(ctx, handler(undefined)))).resolves.toEqual({ data: null });
  });

  it('passes through an existing envelope with meta untouched', async () => {
    const envelope = { data: [{ id: 1 }], meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 } };
    await expect(lastValueFrom(interceptor.intercept(ctx, handler(envelope)))).resolves.toBe(envelope);
  });

  it('does not treat objects with extra keys as envelopes', async () => {
    const value = { data: 'x', other: true };
    await expect(lastValueFrom(interceptor.intercept(ctx, handler(value)))).resolves.toEqual({ data: value });
  });

  it('isEnvelope helper', () => {
    expect(isEnvelope({ data: 1 })).toBe(true);
    expect(isEnvelope({ data: 1, meta: {} })).toBe(true);
    expect(isEnvelope({ meta: {} })).toBe(false);
    expect(isEnvelope(null)).toBe(false);
    expect(isEnvelope([{ data: 1 }])).toBe(false);
  });
});
