import type { PaginationMeta, TokenPair } from './types';

export const REFRESH_TOKEN_KEY = 'lp.refreshToken';
export const ORG_ID_KEY = 'lp.orgId';

const DEFAULT_API_URL = 'http://localhost:4000';

export function getApiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL?.trim();
  const url = raw && raw.length > 0 ? raw : DEFAULT_API_URL;
  return url.replace(/\/+$/, '');
}

// ---------------------------------------------------------------------------
// Token store (module-level, in memory for access token)
// ---------------------------------------------------------------------------

type Listener = (token: string | null) => void;

class TokenStore {
  private accessToken: string | null = null;
  private listeners = new Set<Listener>();

  getAccessToken(): string | null {
    return this.accessToken;
  }

  setAccessToken(token: string | null): void {
    this.accessToken = token;
    this.listeners.forEach((listener) => listener(token));
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const tokenStore = new TokenStore();

function safeStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getRefreshToken(): string | null {
  return safeStorage()?.getItem(REFRESH_TOKEN_KEY) ?? null;
}

export function setRefreshToken(token: string | null): void {
  const storage = safeStorage();
  if (!storage) return;
  if (token) storage.setItem(REFRESH_TOKEN_KEY, token);
  else storage.removeItem(REFRESH_TOKEN_KEY);
}

export function getStoredOrgId(): string | null {
  return safeStorage()?.getItem(ORG_ID_KEY) ?? null;
}

export function setStoredOrgId(orgId: string | null): void {
  const storage = safeStorage();
  if (!storage) return;
  if (orgId) storage.setItem(ORG_ID_KEY, orgId);
  else storage.removeItem(ORG_ID_KEY);
}

export function setSession(tokens: TokenPair): void {
  tokenStore.setAccessToken(tokens.accessToken);
  setRefreshToken(tokens.refreshToken);
}

export function clearSession(): void {
  tokenStore.setAccessToken(null);
  setRefreshToken(null);
  setStoredOrgId(null);
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  readonly status: number;
  readonly details: string[];
  readonly path: string | undefined;

  constructor(status: number, message: string, details: string[] = [], path?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
    this.path = path;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isConflict(): boolean {
    return this.status === 409;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function getErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (isApiError(error)) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

interface ErrorBody {
  statusCode?: number;
  error?: string;
  message?: string | string[];
  path?: string;
}

async function toApiError(response: Response): Promise<ApiError> {
  let body: ErrorBody | null = null;
  try {
    body = (await response.json()) as ErrorBody;
  } catch {
    body = null;
  }
  const rawMessage = body?.message;
  const details = Array.isArray(rawMessage) ? rawMessage : [];
  const message = Array.isArray(rawMessage)
    ? (rawMessage[0] ?? response.statusText)
    : rawMessage ?? body?.error ?? response.statusText ?? 'Request failed';
  return new ApiError(response.status, message || 'Request failed', details, body?.path);
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions {
  query?: Record<string, QueryValue>;
  body?: unknown;
  /** Skip Authorization header entirely. */
  anonymous?: boolean;
  /** Skip the automatic refresh-and-retry on 401. */
  noRetry?: boolean;
  /** Override the org id header for this request. */
  orgId?: string | null;
  signal?: AbortSignal;
}

export interface Envelope<T> {
  data: T;
  meta?: PaginationMeta;
}

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface ApiClientOptions {
  baseUrl?: string;
  fetchFn?: typeof fetch;
  onUnauthorized?: () => void;
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private onUnauthorized: (() => void) | undefined;
  private refreshPromise: Promise<boolean> | null = null;

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? getApiBaseUrl()).replace(/\/+$/, '');
    this.fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init));
    this.onUnauthorized = options.onUnauthorized;
  }

  setOnUnauthorized(handler: (() => void) | undefined): void {
    this.onUnauthorized = handler;
  }

  buildUrl(path: string, query?: Record<string, QueryValue>): string {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const params = new URLSearchParams();
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null || value === '') continue;
        params.set(key, String(value));
      }
    }
    const qs = params.toString();
    return `${this.baseUrl}${normalizedPath}${qs ? `?${qs}` : ''}`;
  }

  buildHeaders(options: RequestOptions): Headers {
    const headers = new Headers({ Accept: 'application/json' });
    if (options.body !== undefined) headers.set('Content-Type', 'application/json');
    if (!options.anonymous) {
      const token = tokenStore.getAccessToken();
      if (token) headers.set('Authorization', `Bearer ${token}`);
    }
    const orgId = options.orgId === undefined ? getStoredOrgId() : options.orgId;
    if (orgId) headers.set('X-Org-Id', orgId);
    return headers;
  }

  async request<T>(method: HttpMethod, path: string, options: RequestOptions = {}): Promise<T> {
    const envelope = await this.requestEnvelope<T>(method, path, options);
    return envelope.data;
  }

  async requestEnvelope<T>(
    method: HttpMethod,
    path: string,
    options: RequestOptions = {},
  ): Promise<Envelope<T>> {
    const response = await this.send(method, path, options);

    if (response.status === 401 && !options.anonymous && !options.noRetry) {
      const refreshed = await this.refreshSession();
      if (refreshed) {
        const retry = await this.send(method, path, options);
        return this.parse<T>(retry);
      }
      throw await toApiError(response);
    }

    return this.parse<T>(response);
  }

  private async send(method: HttpMethod, path: string, options: RequestOptions): Promise<Response> {
    const init: RequestInit = {
      method,
      headers: this.buildHeaders(options),
      signal: options.signal,
    };
    if (options.body !== undefined) init.body = JSON.stringify(options.body);
    return this.fetchFn(this.buildUrl(path, options.query), init);
  }

  private async parse<T>(response: Response): Promise<Envelope<T>> {
    if (!response.ok) throw await toApiError(response);
    if (response.status === 204) return { data: undefined as T };
    const text = await response.text();
    if (!text) return { data: undefined as T };
    const json = JSON.parse(text) as unknown;
    if (json && typeof json === 'object' && 'data' in (json as Record<string, unknown>)) {
      const wrapped = json as Envelope<T>;
      return { data: wrapped.data, meta: wrapped.meta };
    }
    return { data: json as T };
  }

  /**
   * Exchange the stored refresh token for a new pair. Concurrent callers share
   * one in-flight refresh (single-flight). Returns true when a new access token
   * was obtained.
   */
  refreshSession(): Promise<boolean> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.doRefresh().finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  private async doRefresh(): Promise<boolean> {
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      this.handleUnauthorized();
      return false;
    }
    try {
      const response = await this.fetchFn(this.buildUrl('/auth/refresh'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!response.ok) {
        this.handleUnauthorized();
        return false;
      }
      const envelope = (await response.json()) as Envelope<TokenPair> | TokenPair;
      const tokens = 'data' in envelope ? envelope.data : envelope;
      if (!tokens?.accessToken || !tokens.refreshToken) {
        this.handleUnauthorized();
        return false;
      }
      setSession(tokens);
      return true;
    } catch {
      this.handleUnauthorized();
      return false;
    }
  }

  private handleUnauthorized(): void {
    clearSession();
    this.onUnauthorized?.();
  }

  get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('GET', path, options);
  }

  getPaginated<T>(path: string, options?: RequestOptions): Promise<Envelope<T[]>> {
    return this.requestEnvelope<T[]>('GET', path, options);
  }

  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>('POST', path, { ...options, body });
  }

  patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>('PATCH', path, { ...options, body });
  }

  delete<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('DELETE', path, options);
  }
}

export const api = new ApiClient();
