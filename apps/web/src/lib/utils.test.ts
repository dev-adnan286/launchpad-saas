import { describe, expect, it } from 'vitest';
import {
  clamp,
  cn,
  formatDate,
  initials,
  isOverdue,
  percent,
  pluralize,
  relativeTime,
  slugify,
  toDateInputValue,
  truncate,
} from './utils';

describe('cn', () => {
  it('merges class names and resolves tailwind conflicts', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
    expect(cn('text-sm', false && 'hidden', undefined, 'font-bold')).toBe('text-sm font-bold');
  });
});

describe('formatDate', () => {
  it('formats ISO strings and returns empty for invalid input', () => {
    expect(formatDate('2026-03-15T12:00:00.000Z')).toMatch(/Mar 15, 2026/);
    expect(formatDate(null)).toBe('');
    expect(formatDate('garbage')).toBe('');
  });

  it('produces date input values in local time', () => {
    const local = new Date(2026, 4, 7, 10, 0, 0);
    expect(toDateInputValue(local)).toBe('2026-05-07');
    expect(toDateInputValue('')).toBe('');
  });
});

describe('relativeTime', () => {
  const now = new Date('2026-06-01T12:00:00.000Z');

  it('handles recent and future timestamps', () => {
    expect(relativeTime('2026-06-01T11:59:50.000Z', now)).toBe('just now');
    expect(relativeTime('2026-06-01T11:55:00.000Z', now)).toBe('5 minutes ago');
    expect(relativeTime('2026-06-01T09:00:00.000Z', now)).toBe('3 hours ago');
    expect(relativeTime('2026-05-31T12:00:00.000Z', now)).toBe('1 day ago');
    expect(relativeTime('2026-04-01T12:00:00.000Z', now)).toBe('2 months ago');
    expect(relativeTime('2026-06-03T12:00:00.000Z', now)).toBe('in 2 days');
    expect(relativeTime(null, now)).toBe('');
  });
});

describe('initials', () => {
  it('derives up to two uppercase initials', () => {
    expect(initials('Ada Lovelace')).toBe('AL');
    expect(initials('grace brewster murray hopper')).toBe('GH');
    expect(initials('Plato')).toBe('P');
    expect(initials('   ')).toBe('?');
    expect(initials(null)).toBe('?');
  });
});

describe('isOverdue', () => {
  const now = new Date(2026, 5, 10, 15, 0, 0);

  it('is true only for dates before the start of today', () => {
    expect(isOverdue(new Date(2026, 5, 9, 23, 59), now)).toBe(true);
    expect(isOverdue(new Date(2026, 5, 10, 0, 0), now)).toBe(false);
    expect(isOverdue(new Date(2026, 5, 11), now)).toBe(false);
    expect(isOverdue(null, now)).toBe(false);
  });
});

describe('string helpers', () => {
  it('slugify normalizes names', () => {
    expect(slugify('Acme Inc.')).toBe('acme-inc');
    expect(slugify('  Hello   World!! ')).toBe('hello-world');
    expect(slugify('a'.repeat(60))).toHaveLength(48);
  });

  it('pluralize and truncate behave', () => {
    expect(pluralize(1, 'task')).toBe('1 task');
    expect(pluralize(3, 'task')).toBe('3 tasks');
    expect(pluralize(2, 'person', 'people')).toBe('2 people');
    expect(truncate('short', 10)).toBe('short');
    const short = truncate('a very long sentence', 8);
    expect(short.length).toBeLessThanOrEqual(8);
    expect(short.endsWith('…')).toBe(true);
    expect(truncate('abcdefghij', 6)).toBe('abcde…');
  });
});

describe('numeric helpers', () => {
  it('clamp and percent stay within bounds', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(percent(2, 4)).toBe(50);
    expect(percent(9, 4)).toBe(100);
    expect(percent(1, 0)).toBe(0);
  });
});
