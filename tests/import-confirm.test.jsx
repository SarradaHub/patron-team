import { describe, it, expect, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import Controls from '../src/components/Controls.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function renderControls(onImport) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <Controls
        onAddPlayer={() => {}}
        onFormTeam={() => {}}
        onScheduleNext={() => {}}
        onExport={() => {}}
        onImport={onImport}
        onClearLocalCache={() => {}}
        activeRoundId="r1"
        teamSize={5}
        onTeamSizeChange={() => {}}
      />
    );
  });
  return { container, root };
}

async function chooseFile(container, json) {
  const input = container.querySelector('input[type="file"]');
  const file = new File([JSON.stringify(json)], 'backup.json', { type: 'application/json' });
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  for (let i = 0; i < 20 && !container.textContent.includes('Apagar todos os dados locais'); i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
}

describe('importar dados', () => {
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

  it('pede confirmação e só importa depois do sim', async () => {
    const onImport = vi.fn();
    ({ container, root } = renderControls(onImport));
    const payload = { players: [], teams: [], matches: [] };

    await chooseFile(container, payload);
    expect(onImport).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Apagar todos os dados locais');

    const cancel = [...container.querySelectorAll('button')].find(
      (button) => button.textContent.trim() === 'Cancelar'
    );
    await act(async () => {
      cancel.click();
    });
    expect(onImport).not.toHaveBeenCalled();

    await chooseFile(container, payload);
    const confirm = [...container.querySelectorAll('button')].find(
      (button) => button.textContent.trim() === 'Apagar dados locais'
    );
    await act(async () => {
      confirm.click();
    });
    expect(onImport).toHaveBeenCalledTimes(1);
    expect(onImport).toHaveBeenCalledWith(payload);
  });
});
