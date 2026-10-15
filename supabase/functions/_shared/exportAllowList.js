/**
 * @param {string | null | undefined} email
 * @param {string | null | undefined} allowList
 */
export function isExportEmailAllowed(email, allowList) {
  if (typeof email !== 'string') return false;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  if (typeof allowList !== 'string' || !allowList.trim()) return false;
  const allowed = allowList
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(normalized);
}

/**
 * @param {{ email?: string | null } | null | undefined} user
 * @param {string | null | undefined} allowList
 * @returns {{ allowed: true } | { allowed: false, status: 401 | 403, error: string }}
 */
export function authorizeSnapshotExport(user, allowList) {
  const email = user && typeof user.email === 'string' ? user.email : '';
  if (!email.trim()) {
    return {
      allowed: false,
      status: 401,
      error: 'É preciso entrar para enviar para a nuvem.',
    };
  }
  if (!isExportEmailAllowed(email, allowList)) {
    return {
      allowed: false,
      status: 403,
      error: 'Este e-mail não está autorizado a enviar para a nuvem.',
    };
  }
  return { allowed: true };
}
