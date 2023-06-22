import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PlanId } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsIn, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';

export class ChangePlanDto {
  @ApiProperty({ enum: ['FREE', 'PRO', 'ENTERPRISE'] })
  @IsEnum(['FREE', 'PRO', 'ENTERPRISE'])
  planId!: PlanId;
}

export const WEBHOOK_EVENT_TYPES = ['subscription.updated', 'payment.failed', 'subscription.canceled'] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export class WebhookEventDataDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  externalId!: string;

  @ApiPropertyOptional({ enum: ['FREE', 'PRO', 'ENTERPRISE'] })
  @IsOptional()
  @IsEnum(['FREE', 'PRO', 'ENTERPRISE'])
  planId?: PlanId;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  currentPeriodEnd?: string;
}

export class WebhookEventDto {
  @ApiProperty({ enum: WEBHOOK_EVENT_TYPES })
  @IsIn(WEBHOOK_EVENT_TYPES)
  type!: WebhookEventType;

  @ApiProperty({ type: WebhookEventDataDto })
  @ValidateNested()
  @Type(() => WebhookEventDataDto)
  data!: WebhookEventDataDto;
}
