import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Length, Matches, MaxLength, ValidateIf } from 'class-validator';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export class CreateProjectDto {
  @ApiProperty({ example: 'Website Relaunch' })
  @IsString()
  @Length(1, 100)
  @Transform(({ value }: { value: string }) => value.trim())
  name!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional({ example: '#6366f1' })
  @IsOptional()
  @Matches(HEX_COLOR, { message: 'color must be a hex value like #6366f1' })
  color?: string;
}

export class UpdateProjectDto {
  @ApiPropertyOptional({ example: 'Website Relaunch' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  @Transform(({ value }: { value: string }) => value.trim())
  name?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional({ example: '#6366f1' })
  @IsOptional()
  @Matches(HEX_COLOR, { message: 'color must be a hex value like #6366f1' })
  color?: string;
}

export class ListProjectsQueryDto {
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  includeArchived: boolean = false;
}
