// Shapes and enums mirrored from the LaunchPad API contract.

export const MEMBERSHIP_ROLES = ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

export const INVITATION_STATUSES = ['PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED'] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

export const TASK_STATUSES = [
  'BACKLOG',
  'TODO',
  'IN_PROGRESS',
  'IN_REVIEW',
  'DONE',
  'CANCELED',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const PLAN_IDS = ['FREE', 'PRO', 'ENTERPRISE'] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export type SubscriptionStatus = 'ACTIVE' | 'PAST_DUE' | 'CANCELED';

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  createdAt: string;
}

export interface UserRef {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrgSummary extends Organization {
  role: MembershipRole;
  plan: PlanId;
  memberCount: number;
  projectCount: number;
}

export interface Member {
  id: string;
  role: MembershipRole;
  createdAt: string;
  user: {
    id: string;
    email: string;
    name: string;
    avatarUrl: string | null;
  };
}

export interface Invitation {
  id: string;
  email: string;
  role: MembershipRole;
  status: InvitationStatus;
  expiresAt: string;
  createdAt: string;
  invitedBy: { id: string; name: string };
}

export interface InvitationPublic {
  email: string;
  role: MembershipRole;
  organization: { id: string; name: string };
  expiresAt: string;
  status: InvitationStatus;
}

export interface Project {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  color: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  taskCounts: { total: number; done: number };
}

export interface Label {
  id: string;
  name: string;
  color: string;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  position: number;
  assigneeId: string | null;
  assignee: UserRef | null;
  creatorId: string;
  dueDate: string | null;
  labels: Label[];
  commentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  id: string;
  taskId: string;
  body: string;
  author: UserRef;
  createdAt: string;
  updatedAt: string;
}

export type ActivityEntityType =
  | 'organization'
  | 'project'
  | 'task'
  | 'member'
  | 'invitation'
  | 'comment'
  | 'subscription'
  | 'api_key';

export interface Activity {
  id: string;
  organizationId: string;
  projectId: string | null;
  entityType: ActivityEntityType;
  entityId: string;
  action: string;
  metadata: Record<string, unknown> | null;
  actor: UserRef | null;
  createdAt: string;
}

export interface Plan {
  id: PlanId;
  name: string;
  priceMonthly: number;
  maxProjects: number;
  maxMembers: number;
  features: string[];
}

export interface Subscription {
  id: string;
  organizationId: string;
  planId: PlanId;
  status: SubscriptionStatus;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
}

export interface BillingOverview {
  plan: Plan;
  subscription: Subscription;
  usage: { projects: number; members: number };
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  createdBy: { id: string; name: string };
}

export interface ApiKeyCreated {
  apiKey: ApiKey;
  plainKey: string;
}

export interface DashboardStats {
  projects: number;
  tasks: { total: number; open: number; done: number; overdue: number };
  members: number;
  tasksByStatus: Record<TaskStatus, number>;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface SuccessResponse {
  success: boolean;
}
