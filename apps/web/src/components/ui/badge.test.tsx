import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Badge, priorityVariant, roleVariant, statusVariant } from './badge';

describe('Badge', () => {
  it('renders text with the default variant', () => {
    render(<Badge>Draft</Badge>);
    const badge = screen.getByText('Draft');
    expect(badge.className).toContain('bg-slate-100');
  });

  it('applies the requested variant', () => {
    render(<Badge variant="success">Done</Badge>);
    expect(screen.getByText('Done').className).toContain('bg-emerald-50');
  });

  it('renders a color dot when dotColor is provided', () => {
    const { container } = render(<Badge dotColor="#ff0000">Bug</Badge>);
    const dot = container.querySelector('span[aria-hidden="true"]');
    expect(dot).not.toBeNull();
    expect(dot).toHaveStyle({ backgroundColor: '#ff0000' });
  });

  it('maps priorities, statuses and roles to variants', () => {
    expect(priorityVariant('URGENT')).toBe('danger');
    expect(priorityVariant('LOW')).toBe('default');
    expect(priorityVariant('UNKNOWN')).toBe('default');
    expect(statusVariant('DONE')).toBe('success');
    expect(statusVariant('IN_REVIEW')).toBe('brand');
    expect(roleVariant('OWNER')).toBe('brand');
    expect(roleVariant('VIEWER')).toBe('outline');
  });
});
