import { Prisma } from '@prisma/client';

export type ActivityEntityType =
  | 'organization'
  | 'project'
  | 'task'
  | 'member'
  | 'invitation'
  | 'comment'
  | 'subscription'
  | 'api_key';

/**
 * Every domain event is emitted with its `action` as the EventEmitter2 event name
 * (e.g. "task.created") and this payload. The activity listener persists them.
 */
export interface ActivityEvent {
  organizationId: string;
  projectId?: string | null;
  actorId?: string | null;
  entityType: ActivityEntityType;
  entityId: string;
  action: string;
  metadata?: Prisma.InputJsonValue;
}

export const ACTIVITY_EVENT_WILDCARD = '**';
