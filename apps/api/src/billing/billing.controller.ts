import { Body, Controller, Get, Headers, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentOrg } from '../common/decorators/current-org.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { OrgMemberGuard } from '../common/guards/org-member.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { OrgContext } from '../common/types/request';
import { BillingService } from './billing.service';
import { ChangePlanDto, WebhookEventDto } from './dto/billing.dto';
import { SIGNATURE_HEADER } from './webhook-signature';

@ApiTags('billing')
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Public()
  @Get('plans')
  @ApiOperation({ summary: 'Public plan catalog' })
  plans() {
    return this.billing.listPlans();
  }

  @Public()
  @Post('webhook')
  @HttpCode(200)
  @ApiOperation({ summary: 'Payment provider webhook (HMAC signed)' })
  @ApiHeader({ name: 'X-LaunchPad-Signature', required: true })
  async webhook(
    @Req() request: Request & { rawBody?: Buffer },
    @Headers(SIGNATURE_HEADER) signature: string | undefined,
    @Body() event: WebhookEventDto,
  ) {
    await this.billing.handleWebhook(request.rawBody, signature, event);
    return { received: true };
  }

  @Get()
  @ApiBearerAuth()
  @ApiHeader({ name: 'X-Org-Id', required: true })
  @UseGuards(OrgMemberGuard)
  @ApiOperation({ summary: 'Current plan, subscription and usage' })
  overview(@CurrentOrg() org: OrgContext) {
    return this.billing.getOverview(org.organization.id);
  }

  @Post('change-plan')
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiHeader({ name: 'X-Org-Id', required: true })
  @UseGuards(OrgMemberGuard, RolesGuard)
  @Roles('OWNER')
  @ApiOperation({ summary: 'Switch plan (owner only; downgrades are refused when usage exceeds limits)' })
  changePlan(@CurrentOrg() org: OrgContext, @CurrentUser('id') userId: string, @Body() dto: ChangePlanDto) {
    return this.billing.changePlan(org.organization.id, userId, dto.planId);
  }
}
