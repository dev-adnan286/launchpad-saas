import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentOrg } from '../common/decorators/current-org.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { OrgMemberGuard } from '../common/guards/org-member.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { OrgContext } from '../common/types/request';
import { CreateLabelDto, UpdateLabelDto } from './dto/label.dto';
import { LabelsService } from './labels.service';

@ApiTags('labels')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Org-Id', required: true })
@Controller('labels')
@UseGuards(OrgMemberGuard, RolesGuard)
export class LabelsController {
  constructor(private readonly labels: LabelsService) {}

  @Get()
  @ApiOperation({ summary: 'List labels' })
  list(@CurrentOrg() org: OrgContext) {
    return this.labels.list(org.organization.id);
  }

  @Post()
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Create a label' })
  create(@CurrentOrg() org: OrgContext, @Body() dto: CreateLabelDto) {
    return this.labels.create(org.organization.id, dto);
  }

  @Patch(':id')
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Update a label' })
  update(@CurrentOrg() org: OrgContext, @Param('id') id: string, @Body() dto: UpdateLabelDto) {
    return this.labels.update(org.organization.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(200)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Delete a label' })
  async remove(@CurrentOrg() org: OrgContext, @Param('id') id: string) {
    await this.labels.remove(org.organization.id, id);
    return { success: true };
  }
}
