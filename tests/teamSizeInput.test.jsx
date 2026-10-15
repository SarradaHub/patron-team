import { describe, it, expect, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act, useState } from 'react';
import Controls from '../src/components/Controls.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function TeamSizeHarness() {
  const [teamSize, setTeamSize] = useState(5);
  return (
    <Controls activeRoundId="round-1" teamSize={teamSize} onTeamSizeChange={setTeamSize} />
  );
}

function setNativeValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('Jogadores por time', () => {
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

  it('ignora valor fora dos inteiros 1 a 20 e mantém o último válido', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(<TeamSizeHarness />);
    });

    const input = container.querySelector('[data-testid=team-size-input]');
    expect(input.value).toBe('5');

    await act(async () => {
      setNativeValue(input, '');
    });
    expect(input.value).toBe('5');

    await act(async () => {
      setNativeValue(input, '0');
    });
    expect(input.value).toBe('5');

    await act(async () => {
      setNativeValue(input, '21');
    });
    expect(input.value).toBe('5');

    await act(async () => {
      setNativeValue(input, '1.5');
    });
    expect(input.value).toBe('5');

    await act(async () => {
      setNativeValue(input, '8');
    });
    expect(input.value).toBe('8');

    await act(async () => {
      setNativeValue(input, '0');
    });
    expect(input.value).toBe('8');
  });
});
