import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { FakePaymentProvider, PAYMENT_PROVIDER } from './payment-provider';
import { PlanLimitsService } from './plan-limits.service';

@Module({
  controllers: [BillingController],
  providers: [BillingService, PlanLimitsService, { provide: PAYMENT_PROVIDER, useClass: FakePaymentProvider }],
  exports: [BillingService, PlanLimitsService],
})
export class BillingModule {}
