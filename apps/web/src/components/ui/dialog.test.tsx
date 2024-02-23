import * as React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog, Dialog, DialogContent, DialogTrigger } from './dialog';

describe('Dialog', () => {
  it('opens from a trigger and renders title, description and content', async () => {
    render(
      <Dialog>
        <DialogTrigger asChild>
          <button type="button">Open</button>
        </DialogTrigger>
        <DialogContent title="Invite member" description="Send an email invitation.">
          <p>Body content</p>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    const dialog = await screen.findByRole('dialog', { name: 'Invite member' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText('Send an email invitation.')).toBeInTheDocument();
    expect(screen.getByText('Body content')).toBeInTheDocument();
  });

  it('closes via the close button and reports onOpenChange', async () => {
    const onOpenChange = vi.fn();
    render(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent title="Closable">
          <p>Hi</p>
        </DialogContent>
      </Dialog>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('hides the close button when hideClose is set', () => {
    render(
      <Dialog open>
        <DialogContent title="Locked" hideClose>
          <p>Hi</p>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
  });

  it('controlled dialog toggles content', async () => {
    function Harness() {
      const [open, setOpen] = React.useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Show
          </button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent title="Controlled">
              <p>Controlled body</p>
            </DialogContent>
          </Dialog>
        </>
      );
    }
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Show' }));
    expect(await screen.findByText('Controlled body')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByText('Controlled body')).not.toBeInTheDocument());
  });
});

describe('ConfirmDialog', () => {
  it('invokes onConfirm and renders a destructive confirm label', async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        title="Delete project?"
        description="This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={onConfirm}
      />,
    );
    const confirm = screen.getByRole('button', { name: 'Delete' });
    expect(confirm.className).toContain('bg-rose-600');
    await userEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('disables confirm while loading', () => {
    render(
      <ConfirmDialog open onOpenChange={() => {}} title="Wait" description="..." loading onConfirm={() => {}} />,
    );
    expect(screen.getByRole('button', { name: 'Working...' })).toBeDisabled();
  });
});
