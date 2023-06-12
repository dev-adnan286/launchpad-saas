import { Module } from '@nestjs/common';
import { ActivityController } from './activity.controller';
import { ActivityListener } from './activity.listener';
import { ActivityService } from './activity.service';

@Module({
  controllers: [ActivityController],
  providers: [ActivityService, ActivityListener],
  exports: [ActivityService],
})
export class ActivityModule {}
