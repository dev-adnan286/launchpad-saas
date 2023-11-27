import Link from 'next/link';
import { Rocket } from 'lucide-react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-12">
      <Link href="/" className="mb-8 flex items-center gap-2 text-lg font-semibold text-slate-900">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">
          <Rocket className="h-5 w-5" aria-hidden="true" />
        </span>
        LaunchPad
      </Link>
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">{children}</div>
    </div>
  );
}
