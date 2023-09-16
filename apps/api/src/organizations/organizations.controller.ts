import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentOrg } from '../common/decorators/current-org.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { OrgMemberGuard } from '../common/guards/org-member.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { OrgContext } from '../common/types/request';
import { CreateOrganizationDto, UpdateOrganizationDto } from './dto/organization.dto';
import { OrganizationsService } from './organizations.service';

@ApiTags('organizations')
@ApiBearerAuth()
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a workspace (caller becomes OWNER on the FREE plan)' })
  create(@CurrentUser('id') userId: string, @Body() dto: CreateOrganizationDto) {
    return this.organizations.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List workspaces the caller belongs to' })
  listMine(@CurrentUser('id') userId: string) {
    return this.organizations.listForUser(userId);
  }

  @Get(':orgId')
  @UseGuards(OrgMemberGuard)
  @ApiOperation({ summary: 'Workspace details' })
  get(@CurrentOrg() org: OrgContext) {
    return this.organizations.getForMember(org.organization.id, org.membership.role);
  }

  @Patch(':orgId')
  @UseGuards(OrgMemberGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Update workspace name / slug' })
  update(@CurrentOrg() org: OrgContext, @CurrentUser('id') userId: string, @Body() dto: UpdateOrganizationDto) {
    return this.organizations.update(org.organization.id, userId, org.membership.role, dto);
  }

  @Delete(':orgId')
  @HttpCode(200)
  @UseGuards(OrgMemberGuard, RolesGuard)
  @Roles('OWNER')
  @ApiOperation({ summary: 'Delete workspace and everything in it' })
  async remove(@CurrentOrg() org: OrgContext, @CurrentUser('id') userId: string) {
    await this.organizations.remove(org.organization.id, userId);
    return { success: true };
  }

  @Post(':orgId/switch')
  @HttpCode(200)
  @UseGuards(OrgMemberGuard)
  @ApiOperation({ summary: 'Validate membership and return the workspace to switch to' })
  switchTo(@CurrentOrg() org: OrgContext, @Param('orgId') _orgId: string) {
    return this.organizations.getForMember(org.organization.id, org.membership.role);
  }

  @Get(':orgId/stats')
  @UseGuards(OrgMemberGuard)
  @ApiOperation({ summary: 'Dashboard statistics' })
  stats(@CurrentOrg() org: OrgContext) {
    return this.organizations.getStats(org.organization.id);
  }
}
