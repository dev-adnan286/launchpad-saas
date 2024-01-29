'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { projectSchema, type ProjectValues } from '@/lib/schemas/workspace';
import * as projectsApi from '@/lib/api/projects';
import { getErrorMessage } from '@/lib/api/client';
import type { Project } from '@/lib/api/types';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { FormField, Label } from '@/components/ui/label';

export const PROJECT_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#64748b'];

export interface ProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project | null;
  onSaved: (project: Project) => void;
}

export function ProjectDialog({ open, onOpenChange, project, onSaved }: ProjectDialogProps) {
  const { toast } = useToast();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const isEdit = project !== null;

  const form = useForm<ProjectValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: { name: '', description: '', color: PROJECT_COLORS[0] ?? '#6366f1' },
  });

  React.useEffect(() => {
    if (open) {
      form.reset({
        name: project?.name ?? '',
        description: project?.description ?? '',
        color: project?.color ?? PROJECT_COLORS[0] ?? '#6366f1',
      });
      setServerError(null);
    }
  }, [open, project, form]);

  const color = form.watch('color');

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      const payload = { name: values.name, description: values.description || null, color: values.color };
      const saved = isEdit ? await projectsApi.updateProject(project.id, payload) : await projectsApi.createProject(payload);
      toast({ title: isEdit ? 'Project updated' : 'Project created', variant: 'success' });
      onSaved(saved);
      onOpenChange(false);
    } catch (error) {
      setServerError(getErrorMessage(error, 'Unable to save project'));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={isEdit ? 'Edit project' : 'New project'}
        description={isEdit ? 'Update the project details.' : 'Projects group related tasks on a board.'}
      >
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <FormField label="Name" htmlFor="project-name" required>
            <Input id="project-name" placeholder="Website redesign" error={form.formState.errors.name?.message} {...form.register('name')} />
          </FormField>
          <FormField label="Description" htmlFor="project-description">
            <Textarea
              id="project-description"
              rows={3}
              placeholder="What is this project about?"
              error={form.formState.errors.description?.message}
              {...form.register('description')}
            />
          </FormField>
          <div>
            <Label htmlFor="project-color">Color</Label>
            <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Project color">
              {PROJECT_COLORS.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={color === option}
                  aria-label={option}
                  onClick={() => form.setValue('color', option, { shouldValidate: true })}
                  className={cn(
                    'h-7 w-7 rounded-full border-2 transition-transform focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2',
                    color === option ? 'scale-110 border-slate-900' : 'border-transparent',
                  )}
                  style={{ backgroundColor: option }}
                />
              ))}
              <Input
                id="project-color"
                className="w-28"
                error={form.formState.errors.color?.message}
                {...form.register('color')}
              />
            </div>
          </div>
          {serverError && (
            <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {serverError}
            </p>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            <Button type="submit" loading={form.formState.isSubmitting}>
              {isEdit ? 'Save changes' : 'Create project'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
