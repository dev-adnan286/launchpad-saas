import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class ListActivityQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Restrict the feed to one project' })
  @IsOptional()
  @IsUUID()
  projectId?: string;
}
