import type { Settings, TeamId } from './types';

export const DEFAULT_SETTINGS: Settings = {
  rounds: 4,
  multipliers: [1, 1, 2, 3],
  targetScore: 0,
  fastMoney: true,
  fmSeconds: [20, 25],
  fmTarget: 200,
  buzzGraceMs: 1500,
};

export const MAX_STRIKES = 3;
export const FM_QUESTIONS = 5;
export const MAX_NAME_LENGTH = 16;
export const MAX_TEAM_NAME_LENGTH = 18;
export const MAX_PLAYERS = 30;

/** Unambiguous characters for game codes: no 0/O, 1/I/L. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 4;

export const TEAM_IDS: TeamId[] = ['A', 'B'];

export function otherTeam(team: TeamId): TeamId {
  return team === 'A' ? 'B' : 'A';
}

export function multiplierFor(settings: Settings, roundNumber: number): number {
  const m = settings.multipliers;
  if (m.length === 0) return 1;
  return m[Math.min(roundNumber - 1, m.length - 1)];
}

export function clampSettings(s: Settings): Settings {
  const int = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(Number(n) || 0)));
  return {
    rounds: int(s.rounds, 1, 12),
    multipliers: (s.multipliers.length ? s.multipliers : [1]).slice(0, 12).map((m) => int(m, 1, 5)),
    targetScore: int(s.targetScore, 0, 2000),
    fastMoney: !!s.fastMoney,
    fmSeconds: [int(s.fmSeconds[0], 5, 90), int(s.fmSeconds[1], 5, 90)],
    fmTarget: int(s.fmTarget, 50, 500),
    buzzGraceMs: int(s.buzzGraceMs, 300, 5000),
  };
}

export function normalizeCode(code: string): string {
  return (code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);
}

export function cleanName(name: string, max = MAX_NAME_LENGTH): string {
  return (name || '').replace(/\s+/g, ' ').trim().slice(0, max);
}
