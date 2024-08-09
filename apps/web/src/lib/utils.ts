import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value: string | Date | null | undefined, withTime = false): string {
  const date = toDate(value);
  if (!date) return '';
  return withTime ? dateTimeFormatter.format(date) : dateFormatter.format(date);
}

/** Format a date as an `<input type="date">` value (YYYY-MM-DD, local time). */
export function toDateInputValue(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const UNITS: Array<[label: string, seconds: number]> = [
  ['year', 60 * 60 * 24 * 365],
  ['month', 60 * 60 * 24 * 30],
  ['week', 60 * 60 * 24 * 7],
  ['day', 60 * 60 * 24],
  ['hour', 60 * 60],
  ['minute', 60],
];

export function relativeTime(value: string | Date | null | undefined, now: Date = new Date()): string {
  const date = toDate(value);
  if (!date) return '';
  const diffSeconds = Math.round((now.getTime() - date.getTime()) / 1000);
  const abs = Math.abs(diffSeconds);
  if (abs < 45) return diffSeconds >= 0 ? 'just now' : 'in a moment';
  for (const [label, seconds] of UNITS) {
    if (abs >= seconds) {
      const count = Math.floor(abs / seconds);
      const plural = count === 1 ? label : `${label}s`;
      return diffSeconds >= 0 ? `${count} ${plural} ago` : `in ${count} ${plural}`;
    }
  }
  return diffSeconds >= 0 ? 'less than a minute ago' : 'in less than a minute';
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

/** A task is overdue when its due date is strictly before the start of today. */
export function isOverdue(dueDate: string | Date | null | undefined, now: Date = new Date()): boolean {
  const date = toDate(dueDate);
  if (!date) return false;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return date.getTime() < startOfToday.getTime();
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function percent(used: number, limit: number): number {
  if (limit <= 0) return 0;
  return clamp(Math.round((used / limit) * 100), 0, 100);
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to legacy path
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
