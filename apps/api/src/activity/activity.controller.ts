import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentOrg } from '../common/decorators/current-org.decorator';
import { OrgMemberGuard } from '../common/guards/org-member.guard';
import { OrgContext } from '../common/types/request';
import { ActivityService } from './activity.service';
import { ListActivityQueryDto } from './dto/list-activity.dto';

@ApiTags('activity')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Org-Id', required: true })
@Controller('activity')
@UseGuards(OrgMemberGuard)
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @Get()
  @ApiOperation({ summary: 'Paginated activity feed for the organization (optionally per project)' })
  list(@CurrentOrg() org: OrgContext, @Query() query: ListActivityQueryDto) {
    return this.activity.list(org.organization.id, query);
  }
}
