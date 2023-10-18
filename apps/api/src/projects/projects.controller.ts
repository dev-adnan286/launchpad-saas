import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentOrg } from '../common/decorators/current-org.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { OrgMemberGuard } from '../common/guards/org-member.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { OrgContext } from '../common/types/request';
import { CreateProjectDto, ListProjectsQueryDto, UpdateProjectDto } from './dto/project.dto';
import { ProjectsService } from './projects.service';

@ApiTags('projects')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Org-Id', required: true })
@Controller('projects')
@UseGuards(OrgMemberGuard, RolesGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  @ApiOperation({ summary: 'List projects' })
  list(@CurrentOrg() org: OrgContext, @Query() query: ListProjectsQueryDto) {
    return this.projects.list(org.organization.id, query.includeArchived);
  }

  @Post()
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Create a project (enforces plan project limit)' })
  create(@CurrentOrg() org: OrgContext, @CurrentUser('id') userId: string, @Body() dto: CreateProjectDto) {
    return this.projects.create(org.organization.id, userId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Project details' })
  get(@CurrentOrg() org: OrgContext, @Param('id') id: string) {
    return this.projects.get(org.organization.id, id);
  }

  @Patch(':id')
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Update a project' })
  update(@CurrentOrg() org: OrgContext, @CurrentUser('id') userId: string, @Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.projects.update(org.organization.id, userId, id, dto);
  }

  @Post(':id/archive')
  @HttpCode(200)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Archive a project' })
  archive(@CurrentOrg() org: OrgContext, @CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.projects.archive(org.organization.id, userId, id);
  }

  @Post(':id/unarchive')
  @HttpCode(200)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Restore an archived project (counts toward the plan limit)' })
  unarchive(@CurrentOrg() org: OrgContext, @CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.projects.unarchive(org.organization.id, userId, id);
  }

  @Delete(':id')
  @HttpCode(200)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Delete a project and its tasks' })
  async remove(@CurrentOrg() org: OrgContext, @CurrentUser('id') userId: string, @Param('id') id: string) {
    await this.projects.remove(org.organization.id, userId, id);
    return { success: true };
  }
}
