import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiClient,
  ApiError,
  ORG_ID_KEY,
  REFRESH_TOKEN_KEY,
  clearSession,
  getErrorMessage,
  getRefreshToken,
  setStoredOrgId,
  tokenStore,
} from './client';

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('ApiClient', () => {
  let fetchMock: FetchMock;
  let client: ApiClient;
  let onUnauthorized: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    clearSession();
    fetchMock = vi.fn<typeof fetch>();
    onUnauthorized = vi.fn();
    client = new ApiClient({ baseUrl: 'http://api.test/', fetchFn: fetchMock, onUnauthorized });
  });

  afterEach(() => {
    clearSession();
  });

  it('builds URLs with the base and query parameters, skipping empty values', () => {
    const url = client.buildUrl('/projects/1/tasks', { page: 2, status: '', search: undefined, done: false });
    expect(url).toBe('http://api.test/projects/1/tasks?page=2&done=false');
  });

  it('injects Authorization and X-Org-Id headers', async () => {
    tokenStore.setAccessToken('access-1');
    setStoredOrgId('org-1');
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [] }));

    await client.get('/projects');

    const init = fetchMock.mock.calls[0]?.[1];
    const headers = new Headers(init?.headers);
    expect(headers.get('Authorization')).toBe('Bearer access-1');
    expect(headers.get('X-Org-Id')).toBe('org-1');
  });

  it('omits Authorization for anonymous requests and allows org override', async () => {
    tokenStore.setAccessToken('access-1');
    setStoredOrgId('org-1');
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [] }));

    await client.get('/billing/plans', { anonymous: true, orgId: null });

    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get('Authorization')).toBeNull();
    expect(headers.get('X-Org-Id')).toBeNull();
  });

  it('serializes JSON bodies with the content type header', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { id: '1' } }, 201));
    await client.post('/projects', { name: 'X' });
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(JSON.stringify({ name: 'X' }));
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');
  });

  it('unwraps the { data, meta } envelope', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: [{ id: 't1' }], meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }),
    );
    const envelope = await client.getPaginated<{ id: string }>('/tasks');
    expect(envelope.data).toEqual([{ id: 't1' }]);
    expect(envelope.meta?.total).toBe(1);

    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { id: 'u1' } }));
    const user = await client.get<{ id: string }>('/users/me');
    expect(user).toEqual({ id: 'u1' });
  });

  it('returns undefined data for empty 204 responses', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const result = await client.delete('/projects/1');
    expect(result).toBeUndefined();
  });

  it('throws ApiError with status, message and details on non-2xx', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          statusCode: 400,
          error: 'Bad Request',
          message: ['name must be longer', 'color must be hex'],
          path: '/projects',
        },
        400,
      ),
    );
    const error = await client.post('/projects', {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    const apiError = error as ApiError;
    expect(apiError.status).toBe(400);
    expect(apiError.message).toBe('name must be longer');
    expect(apiError.details).toHaveLength(2);
    expect(apiError.path).toBe('/projects');
    expect(getErrorMessage(apiError)).toBe('name must be longer');
  });

  it('refreshes once on 401 and retries the original request', async () => {
    tokenStore.setAccessToken('stale');
    localStorage.setItem(REFRESH_TOKEN_KEY, 'refresh-1');

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ statusCode: 401, message: 'Unauthorized' }, 401))
      .mockResolvedValueOnce(jsonResponse({ data: { accessToken: 'fresh', refreshToken: 'refresh-2' } }))
      .mockResolvedValueOnce(jsonResponse({ data: { id: 'me' } }));

    const result = await client.get<{ id: string }>('/users/me');

    expect(result).toEqual({ id: 'me' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[0]).toBe('http://api.test/auth/refresh');
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({ refreshToken: 'refresh-1' });
    const retryHeaders = new Headers(fetchMock.mock.calls[2]?.[1]?.headers);
    expect(retryHeaders.get('Authorization')).toBe('Bearer fresh');
    expect(tokenStore.getAccessToken()).toBe('fresh');
    expect(getRefreshToken()).toBe('refresh-2');
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('shares a single in-flight refresh between concurrent 401s', async () => {
    tokenStore.setAccessToken('stale');
    localStorage.setItem(REFRESH_TOKEN_KEY, 'refresh-1');
    const refresh = deferred<Response>();

    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      const auth = new Headers(init?.headers).get('Authorization');
      if (url.endsWith('/auth/refresh')) return refresh.promise;
      if (auth === 'Bearer stale') return jsonResponse({ message: 'Unauthorized' }, 401);
      return jsonResponse({ data: { url } });
    });

    const first = client.get<{ url: string }>('/a');
    const second = client.get<{ url: string }>('/b');
    await Promise.resolve();
    refresh.resolve(jsonResponse({ data: { accessToken: 'fresh', refreshToken: 'refresh-2' } }));

    const [a, b] = await Promise.all([first, second]);
    expect(a.url).toContain('/a');
    expect(b.url).toContain('/b');
    const refreshCalls = fetchMock.mock.calls.filter((call) => String(call[0]).endsWith('/auth/refresh'));
    expect(refreshCalls).toHaveLength(1);
  });

  it('clears the session and notifies when refresh fails', async () => {
    tokenStore.setAccessToken('stale');
    localStorage.setItem(REFRESH_TOKEN_KEY, 'refresh-1');
    localStorage.setItem(ORG_ID_KEY, 'org-1');

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ message: 'Unauthorized' }, 401))
      .mockResolvedValueOnce(jsonResponse({ message: 'Token reuse detected' }, 401));

    await expect(client.get('/users/me')).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(tokenStore.getAccessToken()).toBeNull();
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(ORG_ID_KEY)).toBeNull();
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('does not attempt a refresh when no refresh token is stored', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'Unauthorized' }, 401));
    await expect(client.get('/users/me')).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('skips retry when noRetry is set', async () => {
    localStorage.setItem(REFRESH_TOKEN_KEY, 'refresh-1');
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'Unauthorized' }, 401));
    await expect(client.post('/auth/logout', {}, { noRetry: true })).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('notifies token store subscribers', () => {
    const listener = vi.fn();
    const unsubscribe = tokenStore.subscribe(listener);
    tokenStore.setAccessToken('x');
    expect(listener).toHaveBeenCalledWith('x');
    unsubscribe();
    tokenStore.setAccessToken('y');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
