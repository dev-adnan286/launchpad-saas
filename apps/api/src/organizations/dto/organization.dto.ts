import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length, Matches } from 'class-validator';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class CreateOrganizationDto {
  @ApiProperty({ example: 'Acme Inc.' })
  @IsString()
  @Length(2, 80)
  @Transform(({ value }: { value: string }) => value.trim())
  name!: string;

  @ApiPropertyOptional({ example: 'acme', description: 'Lowercase letters, numbers and dashes; generated from name when omitted' })
  @IsOptional()
  @IsString()
  @Length(2, 48)
  @Matches(SLUG_PATTERN, { message: 'slug may only contain lowercase letters, numbers and single dashes' })
  slug?: string;
}

export class UpdateOrganizationDto {
  @ApiPropertyOptional({ example: 'Acme Inc.' })
  @IsOptional()
  @IsString()
  @Length(2, 80)
  @Transform(({ value }: { value: string }) => value.trim())
  name?: string;

  @ApiPropertyOptional({ example: 'acme' })
  @IsOptional()
  @IsString()
  @Length(2, 48)
  @Matches(SLUG_PATTERN, { message: 'slug may only contain lowercase letters, numbers and single dashes' })
  slug?: string;
}
