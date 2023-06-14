import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, Length } from 'class-validator';

export class CreateApiKeyDto {
  @ApiProperty({ example: 'CI deploy key' })
  @IsString()
  @Length(1, 80)
  name!: string;

  @ApiPropertyOptional({ example: '2027-01-01T00:00:00.000Z', description: 'ISO date; omit for a non-expiring key' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
