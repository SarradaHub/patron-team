export function isValidTeamSize(size) {
  return Number.isInteger(size) && size >= 1 && size <= 20;
}

export function assertValidTeamSize(size) {
  if (!isValidTeamSize(size)) {
    throw new Error('Tamanho do time inválido. Informe um inteiro de 1 a 20.');
  }
}

export function rosterMeetsTeamSize(team, teamSize) {
  if (!isValidTeamSize(teamSize)) return false;
  return (team?.players?.length ?? 0) >= teamSize;
}

export function teamSizeFromInput(raw) {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!isValidTeamSize(n)) return null;
  return n;
}
