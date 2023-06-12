import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentOrg } from '../common/decorators/current-org.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { OrgMemberGuard } from '../common/guards/org-member.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { OrgContext } from '../common/types/request';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto/api-key.dto';

@ApiTags('api-keys')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Org-Id', required: true })
@Controller('api-keys')
@UseGuards(OrgMemberGuard, RolesGuard)
@Roles('ADMIN')
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @Get()
  @ApiOperation({ summary: 'List API keys for the organization' })
  list(@CurrentOrg() org: OrgContext) {
    return this.apiKeys.list(org.organization.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create an API key (plain key returned once)' })
  create(@CurrentOrg() org: OrgContext, @CurrentUser('id') userId: string, @Body() dto: CreateApiKeyDto) {
    return this.apiKeys.create(org.organization.id, userId, dto);
  }

  @Delete(':id')
  @HttpCode(200)
  @ApiOperation({ summary: 'Revoke an API key' })
  revoke(@CurrentOrg() org: OrgContext, @CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.apiKeys.revoke(org.organization.id, userId, id);
  }
}
