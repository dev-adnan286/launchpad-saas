import { api } from './client';
import type { Invitation, InvitationPublic, Member, MembershipRole, SuccessResponse } from './types';

export interface CreateInvitationInput {
  email: string;
  role: MembershipRole;
}

export function listInvitations(): Promise<Invitation[]> {
  return api.get<Invitation[]>('/invitations');
}

export function createInvitation(input: CreateInvitationInput): Promise<Invitation> {
  return api.post<Invitation>('/invitations', input);
}

export function revokeInvitation(id: string): Promise<SuccessResponse> {
  return api.delete<SuccessResponse>(`/invitations/${id}`);
}

export function getInvitationByToken(token: string): Promise<InvitationPublic> {
  return api.get<InvitationPublic>(`/invitations/token/${encodeURIComponent(token)}`, {
    anonymous: true,
    orgId: null,
  });
}

export function acceptInvitation(token: string): Promise<Member> {
  return api.post<Member>(`/invitations/token/${encodeURIComponent(token)}/accept`, undefined, {
    orgId: null,
  });
}
