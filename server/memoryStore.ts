import type { GameStore, StoredGame } from './store';

type Listener = (game: StoredGame) => void;

/** In-process store used by the Vite dev server when Supabase isn't configured. */
export class MemoryStore implements GameStore {
  private games = new Map<string, StoredGame & { updatedAt: number }>();
  private listeners = new Map<string, Set<Listener>>();

  async create(code: string, game: Omit<StoredGame, 'version'>) {
    if (this.games.has(code)) return false;
    this.games.set(code, structuredClone({ ...game, version: 1, updatedAt: Date.now() }));
    return true;
  }

  async load(code: string) {
    const g = this.games.get(code);
    return g ? structuredClone(g) : null;
  }

  async save(code: string, expectedVersion: number, game: Omit<StoredGame, 'version'>) {
    const cur = this.games.get(code);
    if (!cur || cur.version !== expectedVersion) return null;
    const next = structuredClone({ ...game, version: cur.version + 1, updatedAt: Date.now() });
    this.games.set(code, next);
    this.listeners.get(code)?.forEach((l) => l(next));
    return next.version;
  }

  async cleanup(idleMinutes: number) {
    const cutoff = Date.now() - idleMinutes * 60_000;
    let n = 0;
    for (const [code, g] of this.games) {
      if (g.updatedAt < cutoff) {
        this.games.delete(code);
        n++;
      }
    }
    return n;
  }

  subscribe(code: string, listener: Listener): () => void {
    if (!this.listeners.has(code)) this.listeners.set(code, new Set());
    this.listeners.get(code)!.add(listener);
    return () => this.listeners.get(code)?.delete(listener);
  }
}
