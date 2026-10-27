import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { GameStore, StoredGame } from './store';

export class SupabaseStore implements GameStore {
  private db: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  }

  async create(code: string, game: Omit<StoredGame, 'version'>) {
    const { data, error } = await this.db.rpc('create_game', {
      p_code: code,
      p_state: game.state,
      p_secrets: game.secrets,
      p_auth: game.auth,
    });
    if (error) throw new Error(`create_game: ${error.message}`);
    return data === true;
  }

  async load(code: string) {
    const { data, error } = await this.db.rpc('load_game', { p_code: code });
    if (error) throw new Error(`load_game: ${error.message}`);
    return (data as StoredGame | null) ?? null;
  }

  async save(code: string, expectedVersion: number, game: Omit<StoredGame, 'version'>) {
    const { data, error } = await this.db.rpc('save_game', {
      p_code: code,
      p_expected_version: expectedVersion,
      p_state: game.state,
      p_secrets: game.secrets,
      p_auth: game.auth,
    });
    if (error) throw new Error(`save_game: ${error.message}`);
    return (data as number | null) ?? null;
  }

  async cleanup(idleMinutes: number) {
    const { data, error } = await this.db.rpc('cleanup_games', { p_idle_minutes: idleMinutes });
    if (error) throw new Error(`cleanup_games: ${error.message}`);
    return (data as number) ?? 0;
  }
}

export function supabaseStoreFromEnv(): SupabaseStore {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  return new SupabaseStore(url, key);
}
