'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  React.useEffect(() => {
    console.error('[LaunchPad] route error', error);
  }, [error]);

  return (
    <div role="alert" className="mx-auto max-w-lg rounded-xl border border-rose-200 bg-white p-8 text-center shadow-sm">
      <h2 className="text-xl font-semibold text-slate-900">Something went wrong</h2>
      <p className="mt-2 text-sm text-slate-600">{error.message || 'An unexpected error occurred while rendering this page.'}</p>
      {error.digest && <p className="mt-1 text-xs text-slate-400">Reference: {error.digest}</p>}
      <Button className="mt-6" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
