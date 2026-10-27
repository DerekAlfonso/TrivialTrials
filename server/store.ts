import type { GameState, Secrets } from '../src/shared/types';

export interface AuthRecord {
  host: string;
  players: Record<string, string>;
}

export interface StoredGame {
  state: GameState;
  secrets: Secrets;
  auth: AuthRecord;
  version: number;
}

/** Persistence for games. Supabase in production, in-memory for local development. */
export interface GameStore {
  /** Returns false if the code is already taken. */
  create(code: string, game: Omit<StoredGame, 'version'>): Promise<boolean>;
  load(code: string): Promise<StoredGame | null>;
  /** Returns the new version, or null if someone else saved first. */
  save(code: string, expectedVersion: number, game: Omit<StoredGame, 'version'>): Promise<number | null>;
  cleanup(idleMinutes: number): Promise<number>;
}
