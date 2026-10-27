import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { GameState } from '../shared/types';
import { api } from './api';

export interface PresenceEntry {
  id: string;
  role: string;
}

export interface Subscription {
  close(): void;
}

interface Handlers {
  onState(state: GameState, version: number): void;
  onPresence(list: PresenceEntry[]): void;
  onStatus(connected: boolean): void;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

let supabase: SupabaseClient | null = null;
function client() {
  if (!supabase) supabase = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  return supabase;
}

/** Live game updates: Supabase Realtime in production, the dev server's SSE stream locally. */
export function subscribe(code: string, me: PresenceEntry, h: Handlers): Subscription {
  return SUPABASE_URL && SUPABASE_ANON_KEY ? subscribeSupabase(code, me, h) : subscribeDev(code, me, h);
}

function subscribeSupabase(code: string, me: PresenceEntry, h: Handlers): Subscription {
  const sb = client();
  let closed = false;
  const refresh = () =>
    api
      .state(code)
      .then(({ state, version }) => !closed && h.onState(state, version))
      .catch(() => undefined);

  const channel = sb
    .channel(`game:${code}`, { config: { presence: { key: me.id } } })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `code=eq.${code}` }, (p) => {
      const row = p.new as { state: GameState; version: number };
      h.onState(row.state, row.version);
    })
    .on('presence', { event: 'sync' }, () => {
      const list = Object.values(channel.presenceState<PresenceEntry>()).flatMap((entries) =>
        entries.map((e) => ({ id: e.id, role: e.role })),
      );
      h.onPresence(list);
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        h.onStatus(true);
        channel.track(me);
        refresh(); // catch anything that changed while we were connecting
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        h.onStatus(false);
      }
    });

  // Phones drop sockets when backgrounded; resync when the page comes back.
  const onVisible = () => document.visibilityState === 'visible' && refresh();
  document.addEventListener('visibilitychange', onVisible);
  refresh();

  return {
    close() {
      closed = true;
      document.removeEventListener('visibilitychange', onVisible);
      sb.removeChannel(channel);
    },
  };
}

function subscribeDev(code: string, me: PresenceEntry, h: Handlers): Subscription {
  const params = new URLSearchParams({ code, id: me.id, role: me.role });
  const es = new EventSource(`/api/events?${params}`);
  es.addEventListener('state', (e) => {
    const { state, version } = JSON.parse((e as MessageEvent).data);
    h.onState(state, version);
  });
  es.addEventListener('presence', (e) => h.onPresence(JSON.parse((e as MessageEvent).data)));
  es.onopen = () => h.onStatus(true);
  es.onerror = () => h.onStatus(false);
  return { close: () => es.close() };
}
