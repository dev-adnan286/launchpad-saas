import { ApiProperty } from '@nestjs/swagger';
import { MembershipRole } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum } from 'class-validator';

export class CreateInvitationDto {
  @ApiProperty({ example: 'teammate@example.com' })
  @IsEmail()
  @Transform(({ value }: { value: string }) => value.trim().toLowerCase())
  email!: string;

  @ApiProperty({ enum: ['ADMIN', 'MEMBER', 'VIEWER'], default: 'MEMBER' })
  @IsEnum(['ADMIN', 'MEMBER', 'VIEWER'], { message: 'role must be ADMIN, MEMBER or VIEWER' })
  role: Exclude<MembershipRole, 'OWNER'> = 'MEMBER';
}
