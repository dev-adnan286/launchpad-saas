import { describe, expect, it } from 'vitest';
import {
  apiKeySchema,
  changePasswordSchema,
  inviteSchema,
  labelSchema,
  loginSchema,
  organizationSchema,
  projectSchema,
  registerSchema,
  resetPasswordSchema,
  taskSchema,
} from './schemas';

function firstIssue(result: { success: boolean; error?: { issues: Array<{ path: PropertyKey[]; message: string }> } }) {
  return result.success ? null : result.error?.issues[0];
}

describe('auth schemas', () => {
  it('loginSchema requires a valid email and non-empty password', () => {
    expect(loginSchema.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(true);
    expect(firstIssue(loginSchema.safeParse({ email: 'nope', password: 'x' }))?.path).toEqual(['email']);
    expect(firstIssue(loginSchema.safeParse({ email: 'a@b.co', password: '' }))?.path).toEqual(['password']);
  });

  it('registerSchema enforces password strength and confirmation', () => {
    const base = { name: 'Ada Lovelace', email: 'ada@example.com' };
    expect(registerSchema.safeParse({ ...base, password: 'Passw0rd1', confirmPassword: 'Passw0rd1' }).success).toBe(true);
    expect(firstIssue(registerSchema.safeParse({ ...base, password: 'short1', confirmPassword: 'short1' }))?.path).toEqual([
      'password',
    ]);
    expect(
      firstIssue(registerSchema.safeParse({ ...base, password: 'onlyletters', confirmPassword: 'onlyletters' }))?.message,
    ).toMatch(/letter and one number/);
    expect(firstIssue(registerSchema.safeParse({ ...base, password: 'Passw0rd1', confirmPassword: 'Other123' }))?.path).toEqual([
      'confirmPassword',
    ]);
    expect(firstIssue(registerSchema.safeParse({ ...base, name: 'A', password: 'Passw0rd1', confirmPassword: 'Passw0rd1' }))?.path).toEqual([
      'name',
    ]);
  });

  it('resetPasswordSchema checks confirmation', () => {
    expect(resetPasswordSchema.safeParse({ password: 'Passw0rd1', confirmPassword: 'Passw0rd1' }).success).toBe(true);
    expect(resetPasswordSchema.safeParse({ password: 'Passw0rd1', confirmPassword: 'x' }).success).toBe(false);
  });

  it('changePasswordSchema rejects reusing the current password', () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: 'Passw0rd1',
      newPassword: 'Passw0rd1',
      confirmPassword: 'Passw0rd1',
    });
    expect(firstIssue(result)?.path).toEqual(['newPassword']);
  });
});

describe('workspace schemas', () => {
  it('organizationSchema accepts empty slug or a valid slug', () => {
    expect(organizationSchema.safeParse({ name: 'Acme', slug: '' }).success).toBe(true);
    expect(organizationSchema.safeParse({ name: 'Acme', slug: 'acme-inc' }).success).toBe(true);
    expect(organizationSchema.safeParse({ name: 'Acme', slug: 'Acme Inc' }).success).toBe(false);
    expect(organizationSchema.safeParse({ name: 'Acme', slug: '-bad-' }).success).toBe(false);
  });

  it('projectSchema validates hex colors', () => {
    expect(projectSchema.safeParse({ name: 'Site', description: '', color: '#6366f1' }).success).toBe(true);
    expect(projectSchema.safeParse({ name: 'Site', description: '', color: '#fff' }).success).toBe(true);
    expect(projectSchema.safeParse({ name: 'Site', description: '', color: 'blue' }).success).toBe(false);
  });

  it('taskSchema validates enums and dates', () => {
    const valid = {
      title: 'Ship it',
      description: '',
      status: 'TODO',
      priority: 'HIGH',
      assigneeId: '',
      dueDate: '2030-01-01',
      labelIds: ['l1'],
    };
    expect(taskSchema.safeParse(valid).success).toBe(true);
    expect(taskSchema.safeParse({ ...valid, status: 'WAITING' }).success).toBe(false);
    expect(taskSchema.safeParse({ ...valid, priority: 'MEGA' }).success).toBe(false);
    expect(taskSchema.safeParse({ ...valid, dueDate: 'not-a-date' }).success).toBe(false);
    expect(taskSchema.safeParse({ ...valid, dueDate: '' }).success).toBe(true);
    expect(taskSchema.safeParse({ ...valid, title: '   ' }).success).toBe(false);
  });

  it('inviteSchema forbids inviting owners', () => {
    expect(inviteSchema.safeParse({ email: 'x@y.co', role: 'MEMBER' }).success).toBe(true);
    expect(inviteSchema.safeParse({ email: 'x@y.co', role: 'OWNER' }).success).toBe(false);
  });

  it('labelSchema trims names and validates colors', () => {
    const result = labelSchema.safeParse({ name: '  Bug ', color: '#ef4444' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe('Bug');
    expect(labelSchema.safeParse({ name: '', color: '#ef4444' }).success).toBe(false);
  });

  it('apiKeySchema requires a future expiry when provided', () => {
    expect(apiKeySchema.safeParse({ name: 'CI', expiresAt: '' }).success).toBe(true);
    expect(apiKeySchema.safeParse({ name: 'CI', expiresAt: '2000-01-01' }).success).toBe(false);
    expect(apiKeySchema.safeParse({ name: 'CI', expiresAt: '2999-01-01' }).success).toBe(true);
  });
});
