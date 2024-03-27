'use client';

import * as React from 'react';
import * as ToastPrimitive from '@radix-ui/react-toast';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ToastVariant = 'default' | 'success' | 'error';

export interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
  durationMs?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
}

interface ToastContextValue {
  toast: (options: ToastOptions) => void;
  dismiss: (id: number) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

let nextId = 1;

const ICONS: Record<ToastVariant, React.ReactNode> = {
  default: <Info className="h-5 w-5 text-brand-600" aria-hidden="true" />,
  success: <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" />,
  error: <AlertCircle className="h-5 w-5 text-rose-600" aria-hidden="true" />,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  const dismiss = React.useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = React.useCallback((options: ToastOptions) => {
    const id = nextId++;
    setToasts((current) => [...current.slice(-4), { ...options, id }]);
  }, []);

  const value = React.useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      <ToastPrimitive.Provider swipeDirection="right">
        {children}
        {toasts.map((item) => (
          <ToastPrimitive.Root
            key={item.id}
            duration={item.durationMs ?? 4500}
            onOpenChange={(open) => {
              if (!open) dismiss(item.id);
            }}
            className={cn(
              'pointer-events-auto flex w-full items-start gap-3 rounded-lg border bg-white p-4 shadow-lg animate-toast-in data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=end]:translate-x-full data-[state=closed]:opacity-0 transition-opacity',
              item.variant === 'error' ? 'border-rose-200' : item.variant === 'success' ? 'border-emerald-200' : 'border-slate-200',
            )}
          >
            {ICONS[item.variant ?? 'default']}
            <div className="min-w-0 flex-1">
              <ToastPrimitive.Title className="text-sm font-semibold text-slate-900">{item.title}</ToastPrimitive.Title>
              {item.description && (
                <ToastPrimitive.Description className="mt-0.5 text-sm text-slate-600">
                  {item.description}
                </ToastPrimitive.Description>
              )}
            </div>
            <ToastPrimitive.Close className="rounded p-0.5 text-slate-400 hover:text-slate-700" aria-label="Dismiss">
              <X className="h-4 w-4" aria-hidden="true" />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport className="fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2 outline-none" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
