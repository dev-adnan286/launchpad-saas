import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

export class CreateCommentDto {
  @ApiProperty({ example: 'Looks good, but let us tighten the copy.' })
  @IsString()
  @Length(1, 5000)
  @Transform(({ value }: { value: string }) => value.trim())
  body!: string;
}

export class UpdateCommentDto extends CreateCommentDto {}
