import { api } from './client';
import type { Member, MembershipRole, SuccessResponse } from './types';

export function listMembers(): Promise<Member[]> {
  return api.get<Member[]>('/members');
}

export function changeMemberRole(memberId: string, role: MembershipRole): Promise<Member> {
  return api.patch<Member>(`/members/${memberId}`, { role });
}

export function removeMember(memberId: string): Promise<SuccessResponse> {
  return api.delete<SuccessResponse>(`/members/${memberId}`);
}
