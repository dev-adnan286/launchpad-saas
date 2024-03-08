'use client';

import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface SelectProps<T extends string = string> {
  id?: string;
  value: T | '';
  onValueChange: (value: T) => void;
  options: ReadonlyArray<SelectOption<T>>;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
  error?: string;
}

/** Radix Select with a typed option list. An empty string value renders the placeholder. */
export function Select<T extends string = string>({
  id,
  value,
  onValueChange,
  options,
  placeholder = 'Select...',
  disabled,
  className,
  error,
  'aria-label': ariaLabel,
}: SelectProps<T>) {
  return (
    <div className="w-full">
      <SelectPrimitive.Root
        value={value === '' ? undefined : value}
        onValueChange={(next) => onValueChange(next as T)}
        disabled={disabled}
      >
        <SelectPrimitive.Trigger
          id={id}
          aria-label={ariaLabel}
          aria-invalid={error ? true : undefined}
          className={cn(
            'flex h-9 w-full items-center justify-between rounded-md border bg-white px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-slate-400',
            error ? 'border-rose-500' : 'border-slate-300',
            className,
          )}
        >
          <SelectPrimitive.Value placeholder={placeholder} />
          <SelectPrimitive.Icon asChild>
            <ChevronDown className="h-4 w-4 opacity-60" aria-hidden="true" />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            position="popper"
            sideOffset={4}
            className="z-50 max-h-72 min-w-[8rem] w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg animate-fade-in"
          >
            <SelectPrimitive.Viewport className="p-1">
              {options.map((option) => (
                <SelectPrimitive.Item
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  className="relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm text-slate-800 outline-none data-[highlighted]:bg-brand-50 data-[highlighted]:text-brand-800 data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                >
                  <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                    <SelectPrimitive.ItemIndicator>
                      <Check className="h-4 w-4" aria-hidden="true" />
                    </SelectPrimitive.ItemIndicator>
                  </span>
                  <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
      {error && (
        <p role="alert" className="mt-1 text-xs text-rose-600">
          {error}
        </p>
      )}
    </div>
  );
}

/** Plain native select for filter bars and forms that must work without JS portals. */
export const NativeSelect = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      'h-9 rounded-md border border-slate-300 bg-white px-3 pr-8 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50',
      className,
    )}
    {...props}
  >
    {children}
  </select>
));
NativeSelect.displayName = 'NativeSelect';
