import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import type { Identity } from '../lib/identity';
import { subscribe, type PresenceEntry } from '../lib/realtime';
import type { Action, GameState, HostSecrets } from '../shared/types';
import { useToast } from '../components/Toast';

export interface GameHandle {
  state: GameState | null;
  version: number;
  presence: PresenceEntry[];
  connected: boolean;
  /** Host only: full answers for the current question / Fast Money. */
  secrets: HostSecrets | null;
  pending: boolean;
  act(action: Action): Promise<boolean>;
  /** Set when this device was removed from the game or it no longer exists. */
  gone: string | null;
}

export function useGame(identity: Identity | null): GameHandle {
  const toast = useToast();
  const [state, setState] = useState<GameState | null>(null);
  const [version, setVersion] = useState(0);
  const [presence, setPresence] = useState<PresenceEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [secrets, setSecrets] = useState<HostSecrets | null>(null);
  const [pending, setPending] = useState(false);
  const [gone, setGone] = useState<string | null>(null);
  const versionRef = useRef(0);

  useEffect(() => {
    if (!identity) return;
    const sub = subscribe(
      identity.code,
      { id: identity.playerId, role: identity.role },
      {
        // Updates can arrive out of order across transports; keep the newest.
        onState(s, v) {
          if (v < versionRef.current) return;
          versionRef.current = v;
          setState(s);
          setVersion(v);
        },
        onPresence: setPresence,
        onStatus: setConnected,
      },
    );
    api
      .state(identity.code)
      .then(({ state: s, version: v }) => {
        if (v >= versionRef.current) {
          versionRef.current = v;
          setState(s);
          setVersion(v);
        }
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 404) setGone('This game has ended or doesn’t exist.');
      });
    return () => sub.close();
  }, [identity]);

  // A player removed by the host finds out here.
  useEffect(() => {
    if (!state || !identity || identity.role !== 'player') return;
    if (!state.players.some((p) => p.id === identity.playerId)) setGone('You were removed from this game.');
  }, [state, identity]);

  // Host: refresh the answer key whenever the game changes.
  useEffect(() => {
    if (!identity || identity.role !== 'host' || !version) return;
    let cancelled = false;
    api
      .secrets(identity)
      .then((s) => !cancelled && setSecrets((prev) => (prev && prev.version > s.version ? prev : s)))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [identity, version]);

  const act = useCallback(
    async (action: Action) => {
      if (!identity) return false;
      setPending(true);
      try {
        await api.act(identity, action);
        return true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Something went wrong';
        if (e instanceof ApiError && e.status === 403) setGone(msg);
        else toast(msg);
        return false;
      } finally {
        setPending(false);
      }
    },
    [identity, toast],
  );

  return { state, version, presence, connected, secrets, pending, act, gone };
}
