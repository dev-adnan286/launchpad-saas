import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentOrg } from '../common/decorators/current-org.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { OrgMemberGuard } from '../common/guards/org-member.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthUser, OrgContext } from '../common/types/request';
import { CreateInvitationDto } from './dto/invitation.dto';
import { InvitationsService } from './invitations.service';

@ApiTags('invitations')
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Public()
  @Get('token/:token')
  @ApiOperation({ summary: 'Public preview of an invitation' })
  preview(@Param('token') token: string) {
    return this.invitations.getByToken(token);
  }

  @Post('token/:token/accept')
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Accept an invitation as the signed-in user' })
  accept(@Param('token') token: string, @CurrentUser() user: AuthUser) {
    return this.invitations.accept(token, user);
  }

  @Get()
  @ApiBearerAuth()
  @ApiHeader({ name: 'X-Org-Id', required: true })
  @UseGuards(OrgMemberGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'List invitations' })
  list(@CurrentOrg() org: OrgContext) {
    return this.invitations.list(org.organization.id);
  }

  @Post()
  @ApiBearerAuth()
  @ApiHeader({ name: 'X-Org-Id', required: true })
  @UseGuards(OrgMemberGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Invite someone by email (enforces plan member limit)' })
  create(@CurrentOrg() org: OrgContext, @CurrentUser() user: AuthUser, @Body() dto: CreateInvitationDto) {
    return this.invitations.create(org.organization.id, org.organization.name, user, dto);
  }

  @Delete(':id')
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiHeader({ name: 'X-Org-Id', required: true })
  @UseGuards(OrgMemberGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Revoke a pending invitation' })
  revoke(@CurrentOrg() org: OrgContext, @CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.invitations.revoke(org.organization.id, userId, id);
  }
}
