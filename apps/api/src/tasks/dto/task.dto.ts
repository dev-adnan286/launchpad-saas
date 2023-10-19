import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TaskPriority, TaskStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export const TASK_STATUS_VALUES: TaskStatus[] = ['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELED'];
export const TASK_PRIORITY_VALUES: TaskPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
export const TASK_SORT_FIELDS = ['createdAt', 'dueDate', 'priority', 'position', 'title'] as const;
export type TaskSortField = (typeof TASK_SORT_FIELDS)[number];

export class CreateTaskDto {
  @ApiProperty({ example: 'Design homepage hero' })
  @IsString()
  @Length(1, 200)
  @Transform(({ value }: { value: string }) => value.trim())
  title!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(10_000)
  description?: string | null;

  @ApiPropertyOptional({ enum: TASK_STATUS_VALUES, default: 'TODO' })
  @IsOptional()
  @IsEnum(TASK_STATUS_VALUES)
  status?: TaskStatus;

  @ApiPropertyOptional({ enum: TASK_PRIORITY_VALUES, default: 'MEDIUM' })
  @IsOptional()
  @IsEnum(TASK_PRIORITY_VALUES)
  priority?: TaskPriority;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  assigneeId?: string | null;

  @ApiPropertyOptional({ nullable: true, example: '2026-12-31T00:00:00.000Z' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  dueDate?: string | null;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  labelIds?: string[];
}

export class UpdateTaskDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 200)
  @Transform(({ value }: { value: string }) => value.trim())
  title?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(10_000)
  description?: string | null;

  @ApiPropertyOptional({ enum: TASK_PRIORITY_VALUES })
  @IsOptional()
  @IsEnum(TASK_PRIORITY_VALUES)
  priority?: TaskPriority;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  assigneeId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  dueDate?: string | null;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  labelIds?: string[];
}

export class ChangeStatusDto {
  @ApiProperty({ enum: TASK_STATUS_VALUES })
  @IsEnum(TASK_STATUS_VALUES)
  status!: TaskStatus;
}

export class AssignTaskDto {
  @ApiProperty({ nullable: true, description: 'Member user id, or null to unassign' })
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  assigneeId!: string | null;
}

export class ReorderTaskDto {
  @ApiProperty()
  @IsUUID()
  taskId!: string;

  @ApiProperty({ enum: TASK_STATUS_VALUES })
  @IsEnum(TASK_STATUS_VALUES)
  toStatus!: TaskStatus;

  @ApiProperty({ minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  toIndex!: number;
}

export class BulkUpdateDataDto {
  @ApiPropertyOptional({ enum: TASK_STATUS_VALUES })
  @IsOptional()
  @IsEnum(TASK_STATUS_VALUES)
  status?: TaskStatus;

  @ApiPropertyOptional({ enum: TASK_PRIORITY_VALUES })
  @IsOptional()
  @IsEnum(TASK_PRIORITY_VALUES)
  priority?: TaskPriority;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  assigneeId?: string | null;
}

export class BulkUpdateTasksDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  taskIds!: string[];

  @ApiProperty({ type: BulkUpdateDataDto })
  @ValidateNested()
  @Type(() => BulkUpdateDataDto)
  data!: BulkUpdateDataDto;
}

export class ListTasksQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: TASK_STATUS_VALUES })
  @IsOptional()
  @IsEnum(TASK_STATUS_VALUES)
  status?: TaskStatus;

  @ApiPropertyOptional({ enum: TASK_PRIORITY_VALUES })
  @IsOptional()
  @IsEnum(TASK_PRIORITY_VALUES)
  priority?: TaskPriority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  labelId?: string;

  @ApiPropertyOptional({ description: 'Case-insensitive search in title and description' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ enum: TASK_SORT_FIELDS, default: 'position' })
  @IsOptional()
  @IsIn(TASK_SORT_FIELDS)
  sortBy: TaskSortField = 'position';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'asc';
}
