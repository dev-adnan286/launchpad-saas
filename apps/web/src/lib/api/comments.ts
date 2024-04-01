import { api } from './client';
import type { Comment, SuccessResponse } from './types';

export function listComments(taskId: string): Promise<Comment[]> {
  return api.get<Comment[]>(`/tasks/${taskId}/comments`);
}

export function createComment(taskId: string, body: string): Promise<Comment> {
  return api.post<Comment>(`/tasks/${taskId}/comments`, { body });
}

export function updateComment(id: string, body: string): Promise<Comment> {
  return api.patch<Comment>(`/comments/${id}`, { body });
}

export function deleteComment(id: string): Promise<SuccessResponse> {
  return api.delete<SuccessResponse>(`/comments/${id}`);
}
