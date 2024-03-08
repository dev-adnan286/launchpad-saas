import { cn } from '@/lib/utils';

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded-md bg-slate-200', className)} {...props} />;
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton key={index} className={cn('h-3', index === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-xl border border-slate-200 bg-white p-5', className)}>
      <Skeleton className="mb-3 h-4 w-1/3" />
      <SkeletonText lines={2} />
    </div>
  );
}
