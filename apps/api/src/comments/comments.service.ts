import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Comment, Membership } from '@prisma/client';
import { ActivityEvent } from '../activity/activity.events';
import { roleAtLeast } from '../common/types/request';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCommentDto, UpdateCommentDto } from './dto/comment.dto';

export interface CommentView {
  id: string;
  taskId: string;
  body: string;
  author: { id: string; name: string; avatarUrl: string | null };
  createdAt: Date;
  updatedAt: Date;
}

const commentInclude = {
  author: { select: { id: true, name: true, avatarUrl: true } },
  task: { select: { projectId: true, title: true, project: { select: { organizationId: true } } } },
} as const;

type CommentWithRelations = Comment & {
  author: CommentView['author'];
  task: { projectId: string; title: string; project: { organizationId: string } };
};

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async listForTask(organizationId: string, taskId: string): Promise<CommentView[]> {
    await this.assertTask(organizationId, taskId);
    const comments = await this.prisma.comment.findMany({
      where: { taskId },
      include: commentInclude,
      orderBy: { createdAt: 'asc' },
    });
    return comments.map((comment) => this.toView(comment));
  }

  async create(organizationId: string, actorId: string, taskId: string, dto: CreateCommentDto): Promise<CommentView> {
    const task = await this.assertTask(organizationId, taskId);
    const comment = await this.prisma.comment.create({
      data: { taskId, authorId: actorId, body: dto.body },
      include: commentInclude,
    });
    this.emit({
      organizationId,
      projectId: task.projectId,
      actorId,
      entityType: 'comment',
      entityId: comment.id,
      action: 'comment.created',
      metadata: { taskId, taskTitle: task.title, excerpt: dto.body.slice(0, 120) },
    });
    return this.toView(comment);
  }

  async update(organizationId: string, actor: Membership, id: string, dto: UpdateCommentDto): Promise<CommentView> {
    const existing = await this.findOrThrow(organizationId, id);
    this.assertCanModify(existing, actor);
    const comment = await this.prisma.comment.update({
      where: { id },
      data: { body: dto.body },
      include: commentInclude,
    });
    return this.toView(comment);
  }

  async remove(organizationId: string, actor: Membership, id: string): Promise<void> {
    const existing = await this.findOrThrow(organizationId, id);
    this.assertCanModify(existing, actor);
    await this.prisma.comment.delete({ where: { id } });
    this.emit({
      organizationId,
      projectId: existing.task.projectId,
      actorId: actor.userId,
      entityType: 'comment',
      entityId: id,
      action: 'comment.deleted',
      metadata: { taskId: existing.taskId, taskTitle: existing.task.title },
    });
  }

  /** Authors can edit their own comments; admins and owners can moderate any comment. */
  private assertCanModify(comment: CommentWithRelations, actor: Membership): void {
    if (comment.authorId === actor.userId) return;
    if (roleAtLeast(actor.role, 'ADMIN')) return;
    throw new ForbiddenException('You can only modify your own comments');
  }

  private async findOrThrow(organizationId: string, id: string): Promise<CommentWithRelations> {
    const comment = await this.prisma.comment.findFirst({
      where: { id, task: { project: { organizationId } } },
      include: commentInclude,
    });
    if (!comment) throw new NotFoundException('Comment not found');
    return comment;
  }

  private async assertTask(organizationId: string, taskId: string): Promise<{ projectId: string; title: string }> {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, project: { organizationId } },
      select: { projectId: true, title: true },
    });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  private toView(comment: CommentWithRelations): CommentView {
    return {
      id: comment.id,
      taskId: comment.taskId,
      body: comment.body,
      author: comment.author,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
    };
  }

  private emit(event: ActivityEvent): void {
    this.events.emit(event.action, event);
  }
}
