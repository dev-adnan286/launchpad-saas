import { api } from './client';
import type { ApiKey, ApiKeyCreated, SuccessResponse } from './types';

export interface CreateApiKeyInput {
  name: string;
  expiresAt?: string | null;
}

export function listApiKeys(): Promise<ApiKey[]> {
  return api.get<ApiKey[]>('/api-keys');
}

export function createApiKey(input: CreateApiKeyInput): Promise<ApiKeyCreated> {
  return api.post<ApiKeyCreated>('/api-keys', input);
}

export function revokeApiKey(id: string): Promise<SuccessResponse> {
  return api.delete<SuccessResponse>(`/api-keys/${id}`);
}
