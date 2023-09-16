import { ApiProperty } from '@nestjs/swagger';
import { MembershipRole } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class ChangeRoleDto {
  @ApiProperty({ enum: ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'] })
  @IsEnum(['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'])
  role!: MembershipRole;
}
