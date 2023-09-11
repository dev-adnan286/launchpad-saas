import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length, Matches } from 'class-validator';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export class CreateLabelDto {
  @ApiProperty({ example: 'bug' })
  @IsString()
  @Length(1, 40)
  @Transform(({ value }: { value: string }) => value.trim())
  name!: string;

  @ApiPropertyOptional({ example: '#ef4444' })
  @IsOptional()
  @Matches(HEX_COLOR, { message: 'color must be a hex value like #ef4444' })
  color?: string;
}

export class UpdateLabelDto {
  @ApiPropertyOptional({ example: 'bug' })
  @IsOptional()
  @IsString()
  @Length(1, 40)
  @Transform(({ value }: { value: string }) => value.trim())
  name?: string;

  @ApiPropertyOptional({ example: '#ef4444' })
  @IsOptional()
  @Matches(HEX_COLOR, { message: 'color must be a hex value like #ef4444' })
  color?: string;
}
