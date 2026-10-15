import { describe, it, expect, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import Controls from '../src/components/Controls.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('Adicionar jogador', () => {
  let container;
  let root;

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
    }
    container?.remove();
  });

  it('shows an inline error when the name is empty', async () => {
    const onAddPlayer = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(
        <Controls
          onAddPlayer={onAddPlayer}
          activeRoundId="round-1"
          teamSize={5}
          onTeamSizeChange={() => {}}
        />
      );
    });

    const submit = container.querySelector('[data-testid=add-player-submit]');
    await act(async () => {
      submit.click();
    });

    expect(container.querySelector('#add-player-error')?.textContent).toBe(
      'Informe o nome do jogador.'
    );
    expect(onAddPlayer).not.toHaveBeenCalled();
  });
});
