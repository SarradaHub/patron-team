import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { authorizeSnapshotExport } from '../supabase/functions/_shared/exportAllowList.js';

describe('quem pode enviar o snapshot', () => {
  it('aceita o e-mail que está na lista separada por vírgula', () => {
    expect(authorizeSnapshotExport({ email: 'org@pelada.test' }, 'outro@x.test, org@pelada.test')).toEqual({
      allowed: true,
    });
  });

  it('recusa uma lista ausente, vazia ou sem esse e-mail', () => {
    expect(authorizeSnapshotExport({ email: 'org@pelada.test' }, undefined).status).toBe(403);
    expect(authorizeSnapshotExport({ email: 'org@pelada.test' }, '').status).toBe(403);
    expect(authorizeSnapshotExport({ email: 'org@pelada.test' }, '   ').status).toBe(403);
    expect(authorizeSnapshotExport({ email: 'org@pelada.test' }, 'outro@x.test').status).toBe(403);
  });

  it('recusa quem não entrou', () => {
    expect(authorizeSnapshotExport(null, 'org@pelada.test')).toEqual({
      allowed: false,
      status: 401,
      error: 'É preciso entrar para enviar para a nuvem.',
    });
  });

  it('recusa um e-mail fora da lista e mantém a mensagem de recusa', () => {
    expect(authorizeSnapshotExport({ email: 'fora@pelada.test' }, 'org@pelada.test')).toEqual({
      allowed: false,
      status: 403,
      error: 'Este e-mail não está autorizado a enviar para a nuvem.',
    });
  });
});

function filesUnder(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...filesUnder(path));
    else found.push(path);
  }
  return found;
}

describe('lista fora do site publicado', () => {
  it('não coloca EXPORT_ALLOWED_EMAILS no bundle nem no workflow do Pages', () => {
    const files = [
      '.github/workflows/deploy-gh-pages.yml',
      'vite.config.js',
      ...filesUnder('src'),
    ];
    const hits = files.filter((file) => readFileSync(file, 'utf8').includes('EXPORT_ALLOWED_EMAILS'));
    expect(hits).toEqual([]);
  });
});
