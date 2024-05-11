import { api } from './client';
import type { Label, SuccessResponse } from './types';

export interface LabelInput {
  name: string;
  color: string;
}

export function listLabels(): Promise<Label[]> {
  return api.get<Label[]>('/labels');
}

export function createLabel(input: LabelInput): Promise<Label> {
  return api.post<Label>('/labels', input);
}

export function updateLabel(id: string, input: Partial<LabelInput>): Promise<Label> {
  return api.patch<Label>(`/labels/${id}`, input);
}

export function deleteLabel(id: string): Promise<SuccessResponse> {
  return api.delete<SuccessResponse>(`/labels/${id}`);
}
