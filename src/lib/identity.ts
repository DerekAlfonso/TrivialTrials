import type { Role } from '../shared/types';

export interface Identity {
  code: string;
  role: Role;
  playerId: string;
  token: string;
}

// sessionStorage keeps each browser tab a separate identity (handy for testing on one machine)
// while surviving refreshes. localStorage remembers the last game so a closed tab can rejoin.

const key = (code: string) => `tt:id:${code}`;
const LAST = 'tt:last';

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function getIdentity(code: string): Identity | null {
  return safe(() => {
    const raw = sessionStorage.getItem(key(code));
    return raw ? (JSON.parse(raw) as Identity) : null;
  }, null);
}

export function saveIdentity(id: Identity) {
  safe(() => {
    sessionStorage.setItem(key(id.code), JSON.stringify(id));
    if (id.role !== 'board') localStorage.setItem(LAST, JSON.stringify({ ...id, savedAt: Date.now() }));
  }, undefined);
}

export function clearIdentity(code: string) {
  safe(() => {
    sessionStorage.removeItem(key(code));
    const last = getLastGame();
    if (last?.code === code) localStorage.removeItem(LAST);
  }, undefined);
}

/** The last game this browser played, if it's less than 12 hours old. */
export function getLastGame(): Identity | null {
  return safe(() => {
    const raw = localStorage.getItem(LAST);
    if (!raw) return null;
    const v = JSON.parse(raw) as Identity & { savedAt: number };
    return Date.now() - v.savedAt < 12 * 3600_000 ? v : null;
  }, null);
}
