import * as React from 'react';
import { cn } from '@/lib/utils';

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
}

export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, required, children, ...props }, ref) => (
    <label
      ref={ref}
      className={cn('mb-1.5 block text-sm font-medium text-slate-700', className)}
      {...props}
    >
      {children}
      {required && (
        <span aria-hidden="true" className="ml-0.5 text-rose-500">
          *
        </span>
      )}
    </label>
  ),
);
Label.displayName = 'Label';

export function FormField({
  label,
  htmlFor,
  required,
  hint,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-0', className)}>
      <Label htmlFor={htmlFor} required={required}>
        {label}
      </Label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
