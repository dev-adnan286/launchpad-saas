import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ACTIVITY_EVENT_WILDCARD, ActivityEvent } from './activity.events';
import { ActivityService } from './activity.service';

/**
 * Subscribes to every domain event ("task.created", "member.role_changed", ...) and persists
 * it to the activity feed. Persistence failures are logged and never propagate to the emitter.
 */
@Injectable()
export class ActivityListener {
  private readonly logger = new Logger(ActivityListener.name);

  constructor(private readonly activity: ActivityService) {}

  @OnEvent(ACTIVITY_EVENT_WILDCARD, { async: true, promisify: true })
  async handle(event: ActivityEvent): Promise<void> {
    if (!isActivityEvent(event)) return;
    try {
      await this.activity.record(event);
    } catch (error) {
      this.logger.error(`Failed to record activity ${event.action}: ${(error as Error).message}`);
    }
  }
}

function isActivityEvent(value: unknown): value is ActivityEvent {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<ActivityEvent>;
  return (
    typeof candidate.organizationId === 'string' &&
    typeof candidate.entityType === 'string' &&
    typeof candidate.entityId === 'string' &&
    typeof candidate.action === 'string'
  );
}
