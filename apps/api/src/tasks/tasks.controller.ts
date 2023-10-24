import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentOrg } from '../common/decorators/current-org.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { OrgMemberGuard } from '../common/guards/org-member.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { OrgContext } from '../common/types/request';
import {
  AssignTaskDto,
  BulkUpdateTasksDto,
  ChangeStatusDto,
  CreateTaskDto,
  ListTasksQueryDto,
  ReorderTaskDto,
  UpdateTaskDto,
} from './dto/task.dto';
import { TasksService } from './tasks.service';

@ApiTags('tasks')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Org-Id', required: true })
@Controller()
@UseGuards(OrgMemberGuard, RolesGuard)
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get('projects/:projectId/tasks')
  @ApiOperation({ summary: 'List tasks with filters, sorting and pagination' })
  list(@CurrentOrg() org: OrgContext, @Param('projectId') projectId: string, @Query() query: ListTasksQueryDto) {
    return this.tasks.list(org.organization.id, projectId, query);
  }

  @Post('projects/:projectId/tasks')
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Create a task' })
  create(
    @CurrentOrg() org: OrgContext,
    @CurrentUser('id') userId: string,
    @Param('projectId') projectId: string,
    @Body() dto: CreateTaskDto,
  ) {
    return this.tasks.create(org.organization.id, projectId, userId, dto);
  }

  @Post('tasks/reorder')
  @HttpCode(200)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Move a task to a column/index (Kanban drag & drop)' })
  reorder(@CurrentOrg() org: OrgContext, @CurrentUser('id') userId: string, @Body() dto: ReorderTaskDto) {
    return this.tasks.reorder(org.organization.id, userId, dto);
  }

  @Post('tasks/bulk')
  @HttpCode(200)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Bulk update status / priority / assignee' })
  bulk(@CurrentOrg() org: OrgContext, @CurrentUser('id') userId: string, @Body() dto: BulkUpdateTasksDto) {
    return this.tasks.bulkUpdate(org.organization.id, userId, dto);
  }

  @Get('tasks/:taskId')
  @ApiOperation({ summary: 'Task details' })
  get(@CurrentOrg() org: OrgContext, @Param('taskId') taskId: string) {
    return this.tasks.get(org.organization.id, taskId);
  }

  @Patch('tasks/:taskId')
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Update task fields' })
  update(@CurrentOrg() org: OrgContext, @CurrentUser('id') userId: string, @Param('taskId') taskId: string, @Body() dto: UpdateTaskDto) {
    return this.tasks.update(org.organization.id, userId, taskId, dto);
  }

  @Delete('tasks/:taskId')
  @HttpCode(200)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Delete a task' })
  async remove(@CurrentOrg() org: OrgContext, @CurrentUser('id') userId: string, @Param('taskId') taskId: string) {
    await this.tasks.remove(org.organization.id, userId, taskId);
    return { success: true };
  }

  @Post('tasks/:taskId/status')
  @HttpCode(200)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Change status (validated transition)' })
  changeStatus(
    @CurrentOrg() org: OrgContext,
    @CurrentUser('id') userId: string,
    @Param('taskId') taskId: string,
    @Body() dto: ChangeStatusDto,
  ) {
    return this.tasks.changeStatus(org.organization.id, userId, taskId, dto.status);
  }

  @Post('tasks/:taskId/assign')
  @HttpCode(200)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Assign or unassign a task' })
  assign(@CurrentOrg() org: OrgContext, @CurrentUser('id') userId: string, @Param('taskId') taskId: string, @Body() dto: AssignTaskDto) {
    return this.tasks.assign(org.organization.id, userId, taskId, dto);
  }
}
