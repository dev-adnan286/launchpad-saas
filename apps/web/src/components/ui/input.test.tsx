import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Input, Textarea } from './input';

describe('Input', () => {
  it('renders an accessible text input and forwards value changes', async () => {
    const onChange = vi.fn();
    render(<Input id="email" aria-label="Email" onChange={onChange} />);
    const input = screen.getByRole('textbox', { name: 'Email' });
    await userEvent.type(input, 'abc');
    expect(onChange).toHaveBeenCalledTimes(3);
    expect(input).toHaveValue('abc');
  });

  it('shows an error message linked via aria-describedby', () => {
    render(<Input id="name" aria-label="Name" error="Name is required" />);
    const input = screen.getByRole('textbox', { name: 'Name' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'name-error');
    expect(screen.getByRole('alert')).toHaveTextContent('Name is required');
  });

  it('does not set aria-invalid without an error', () => {
    render(<Input id="plain" aria-label="Plain" />);
    expect(screen.getByRole('textbox', { name: 'Plain' })).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('supports the disabled state', () => {
    render(<Input id="d" aria-label="Disabled" disabled />);
    expect(screen.getByRole('textbox', { name: 'Disabled' })).toBeDisabled();
  });
});

describe('Textarea', () => {
  it('renders and reports errors', () => {
    render(<Textarea id="body" aria-label="Body" error="Too long" />);
    expect(screen.getByRole('textbox', { name: 'Body' })).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Too long');
  });
});
