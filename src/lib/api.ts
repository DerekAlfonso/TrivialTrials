import type { Action, GameState, HostSecrets, Role } from '../shared/types';
import type { Identity } from './identity';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function post<T>(route: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Network problem. Check your connection.', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? `Request failed (${res.status})`, res.status);
  return data as T;
}

export const api = {
  create: () => post<Identity>('create', {}),
  join: (code: string, name: string, rejoin?: { playerId: string; token: string }) =>
    post<Identity>('join', { code, name, role: 'player', rejoin }),
  joinBoard: (code: string) => post<Identity>('join', { code, role: 'board' satisfies Role }),
  state: (code: string) => post<{ state: GameState; version: number }>('state', { code }),
  act: (id: Identity, action: Action) =>
    post<{ version: number }>('action', { code: id.code, playerId: id.playerId, token: id.token, action }),
  secrets: (id: Identity) => post<HostSecrets>('secrets', { code: id.code, token: id.token }),
};
