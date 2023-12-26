import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">404</p>
      <h1 className="mt-2 text-3xl font-bold text-slate-900">Page not found</h1>
      <p className="mt-2 max-w-md text-slate-600">The page you are looking for does not exist or has moved.</p>
      <div className="mt-6 flex gap-3">
        <Link href="/" className={buttonVariants({ variant: 'secondary' })}>
          Home
        </Link>
        <Link href="/app" className={buttonVariants()}>
          Open app
        </Link>
      </div>
    </div>
  );
}
