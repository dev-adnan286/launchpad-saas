import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentOrg } from '../common/decorators/current-org.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { OrgMemberGuard } from '../common/guards/org-member.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { OrgContext } from '../common/types/request';
import { CommentsService } from './comments.service';
import { CreateCommentDto, UpdateCommentDto } from './dto/comment.dto';

@ApiTags('comments')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Org-Id', required: true })
@Controller()
@UseGuards(OrgMemberGuard, RolesGuard)
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get('tasks/:taskId/comments')
  @ApiOperation({ summary: 'List comments on a task' })
  list(@CurrentOrg() org: OrgContext, @Param('taskId') taskId: string) {
    return this.comments.listForTask(org.organization.id, taskId);
  }

  @Post('tasks/:taskId/comments')
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Add a comment' })
  create(@CurrentOrg() org: OrgContext, @CurrentUser('id') userId: string, @Param('taskId') taskId: string, @Body() dto: CreateCommentDto) {
    return this.comments.create(org.organization.id, userId, taskId, dto);
  }

  @Patch('comments/:id')
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Edit a comment (author or admin)' })
  update(@CurrentOrg() org: OrgContext, @Param('id') id: string, @Body() dto: UpdateCommentDto) {
    return this.comments.update(org.organization.id, org.membership, id, dto);
  }

  @Delete('comments/:id')
  @HttpCode(200)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Delete a comment (author or admin)' })
  async remove(@CurrentOrg() org: OrgContext, @Param('id') id: string) {
    await this.comments.remove(org.organization.id, org.membership, id);
    return { success: true };
  }
}
