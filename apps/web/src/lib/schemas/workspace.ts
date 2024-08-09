import { z } from 'zod';
import { MEMBERSHIP_ROLES, PLAN_IDS, TASK_PRIORITIES, TASK_STATUSES } from '../api/types';
import { emailSchema } from './auth';

const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const slugSchema = z
  .string()
  .trim()
  .min(3, 'Slug must be at least 3 characters')
  .max(48, 'Slug is too long')
  .regex(SLUG, 'Use lowercase letters, numbers and single hyphens');

export const organizationSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80, 'Name is too long'),
  slug: z.union([z.literal(''), slugSchema]),
});
export type OrganizationValues = z.infer<typeof organizationSchema>;

export const projectSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100, 'Name is too long'),
  description: z.string().trim().max(2000, 'Description is too long'),
  color: z.string().regex(HEX_COLOR, 'Enter a valid hex color'),
});
export type ProjectValues = z.infer<typeof projectSchema>;

export const taskStatusSchema = z.enum(TASK_STATUSES);
export const taskPrioritySchema = z.enum(TASK_PRIORITIES);
export const membershipRoleSchema = z.enum(MEMBERSHIP_ROLES);
export const planIdSchema = z.enum(PLAN_IDS);

export const taskSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200, 'Title is too long'),
  description: z.string().trim().max(5000, 'Description is too long'),
  status: taskStatusSchema,
  priority: taskPrioritySchema,
  assigneeId: z.string(),
  dueDate: z
    .string()
    .refine((value) => value === '' || !Number.isNaN(new Date(value).getTime()), {
      message: 'Enter a valid date',
    }),
  labelIds: z.array(z.string()),
});
export type TaskValues = z.infer<typeof taskSchema>;

export const inviteSchema = z.object({
  email: emailSchema,
  role: membershipRoleSchema.exclude(['OWNER']),
});
export type InviteValues = z.infer<typeof inviteSchema>;

export const labelSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(40, 'Name is too long'),
  color: z.string().regex(HEX_COLOR, 'Enter a valid hex color'),
});
export type LabelValues = z.infer<typeof labelSchema>;

export const commentSchema = z.object({
  body: z.string().trim().min(1, 'Comment cannot be empty').max(5000, 'Comment is too long'),
});
export type CommentValues = z.infer<typeof commentSchema>;

export const apiKeySchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(60, 'Name is too long'),
  expiresAt: z
    .string()
    .refine((value) => value === '' || new Date(value).getTime() > Date.now(), {
      message: 'Expiry must be in the future',
    }),
});
export type ApiKeyValues = z.infer<typeof apiKeySchema>;
