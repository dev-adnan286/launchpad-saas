import { Body, Controller, Delete, Get, HttpCode, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentOrg } from '../common/decorators/current-org.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { OrgMemberGuard } from '../common/guards/org-member.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { OrgContext } from '../common/types/request';
import { ChangeRoleDto } from './dto/change-role.dto';
import { MembershipsService } from './memberships.service';

@ApiTags('members')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Org-Id', required: true })
@Controller('members')
@UseGuards(OrgMemberGuard, RolesGuard)
export class MembershipsController {
  constructor(private readonly memberships: MembershipsService) {}

  @Get()
  @ApiOperation({ summary: 'List members' })
  list(@CurrentOrg() org: OrgContext) {
    return this.memberships.list(org.organization.id);
  }

  @Patch(':memberId')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Change a member role' })
  changeRole(@CurrentOrg() org: OrgContext, @Param('memberId') memberId: string, @Body() dto: ChangeRoleDto) {
    return this.memberships.changeRole(org.organization.id, org.membership, memberId, dto.role);
  }

  @Delete(':memberId')
  @HttpCode(200)
  @ApiOperation({ summary: 'Remove a member (admins) or leave (self)' })
  async remove(@CurrentOrg() org: OrgContext, @Param('memberId') memberId: string) {
    await this.memberships.remove(org.organization.id, org.membership, memberId);
    return { success: true };
  }
}
