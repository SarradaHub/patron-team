import { describe, it, expect, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import EditPlayerModal from '../src/components/EditPlayerModal.jsx';
import ConfirmDialog from '../src/components/ConfirmDialog.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const player = {
  id: 'p1',
  name: 'Ana',
  goalkeeperOnly: false,
  preferGoalkeeper: false,
};

describe('Dialog keyboard', () => {
  let container;
  let root;

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
    }
    container?.remove();
    document.body.style.overflow = '';
  });

  it('closes edit player on Escape and wraps Tab inside the dialog', async () => {
    const onClose = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(
        <EditPlayerModal player={player} onClose={onClose} onSave={() => {}} />
      );
    });

    const last = [...container.querySelectorAll('button')].at(-1);
    last.focus();
    await act(async () => {
      last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    });
    expect(document.activeElement).toBe(container.querySelector('#edit-player-name'));

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('locks body scroll while edit player is open', async () => {
    document.body.style.overflow = '';
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(
        <EditPlayerModal player={player} onClose={() => {}} onSave={() => {}} />
      );
    });
    expect(document.body.style.overflow).toBe('hidden');

    await act(async () => {
      root.unmount();
    });
    root = null;
    expect(document.body.style.overflow).toBe('');
  });

  it('does not cancel a confirm from the backdrop, and Escape does', async () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(
        <ConfirmDialog
          title="Limpar cache local"
          message="Apagar os dados locais?"
          onCancel={onCancel}
          onConfirm={onConfirm}
        />
      );
    });

    await act(async () => {
      container.querySelector('.modal-backdrop').click();
    });
    expect(onCancel).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
