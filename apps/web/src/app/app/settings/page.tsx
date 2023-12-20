'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CreditCard, KeyRound, Settings2 } from 'lucide-react';
import { useOrg } from '@/hooks/use-org';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GeneralSettings } from '@/components/settings/general-settings';
import { BillingSettings } from '@/components/settings/billing-settings';
import { ApiKeysSettings } from '@/components/settings/api-keys-settings';

const TABS = ['general', 'billing', 'api-keys'] as const;
type Tab = (typeof TABS)[number];

function isTab(value: string | null): value is Tab {
  return value !== null && (TABS as readonly string[]).includes(value);
}

function SettingsTabs() {
  const router = useRouter();
  const params = useSearchParams();
  const { can } = useOrg();
  const requested = params.get('tab');
  const tab: Tab = isTab(requested) ? requested : 'general';

  const setTab = (value: string) => {
    if (!isTab(value)) return;
    router.replace(value === 'general' ? '/app/settings' : `/app/settings?tab=${value}`);
  };

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList aria-label="Settings sections">
        <TabsTrigger value="general">
          <Settings2 className="h-4 w-4" aria-hidden="true" />
          General
        </TabsTrigger>
        <TabsTrigger value="billing">
          <CreditCard className="h-4 w-4" aria-hidden="true" />
          Billing
        </TabsTrigger>
        <TabsTrigger value="api-keys" disabled={!can('ADMIN')}>
          <KeyRound className="h-4 w-4" aria-hidden="true" />
          API keys
        </TabsTrigger>
      </TabsList>
      <TabsContent value="general">
        <GeneralSettings />
      </TabsContent>
      <TabsContent value="billing">
        <BillingSettings />
      </TabsContent>
      <TabsContent value="api-keys">
        <ApiKeysSettings />
      </TabsContent>
    </Tabs>
  );
}

export default function SettingsPage() {
  const { currentOrg } = useOrg();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage <span className="font-medium text-slate-700">{currentOrg?.name}</span>, its plan and integrations.
        </p>
      </div>
      <React.Suspense fallback={null}>
        <SettingsTabs />
      </React.Suspense>
    </div>
  );
}
