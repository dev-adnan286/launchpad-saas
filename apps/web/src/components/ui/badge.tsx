import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'border-slate-200 bg-slate-100 text-slate-700',
        brand: 'border-brand-200 bg-brand-50 text-brand-700',
        success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        warning: 'border-amber-200 bg-amber-50 text-amber-800',
        danger: 'border-rose-200 bg-rose-50 text-rose-700',
        info: 'border-sky-200 bg-sky-50 text-sky-700',
        outline: 'border-slate-300 bg-transparent text-slate-700',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  /** Optional color dot rendered before the content (hex or css color). */
  dotColor?: string;
}

export function Badge({ className, variant, dotColor, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dotColor && (
        <span
          aria-hidden="true"
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: dotColor }}
        />
      )}
      {children}
    </span>
  );
}

const PRIORITY_VARIANT: Record<string, BadgeProps['variant']> = {
  LOW: 'default',
  MEDIUM: 'info',
  HIGH: 'warning',
  URGENT: 'danger',
};

const STATUS_VARIANT: Record<string, BadgeProps['variant']> = {
  BACKLOG: 'default',
  TODO: 'info',
  IN_PROGRESS: 'warning',
  IN_REVIEW: 'brand',
  DONE: 'success',
  CANCELED: 'danger',
};

const ROLE_VARIANT: Record<string, BadgeProps['variant']> = {
  OWNER: 'brand',
  ADMIN: 'info',
  MEMBER: 'default',
  VIEWER: 'outline',
};

export function priorityVariant(priority: string): BadgeProps['variant'] {
  return PRIORITY_VARIANT[priority] ?? 'default';
}

export function statusVariant(status: string): BadgeProps['variant'] {
  return STATUS_VARIANT[status] ?? 'default';
}

export function roleVariant(role: string): BadgeProps['variant'] {
  return ROLE_VARIANT[role] ?? 'default';
}
