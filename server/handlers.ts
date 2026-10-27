import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import bank from '../data/questions.json';
import { applyAction, createGame, GameError, type Ctx } from '../src/shared/reducer';
import { CODE_ALPHABET, CODE_LENGTH, normalizeCode } from '../src/shared/rules';
import type { Action, Actor, HostSecrets, Question, QuestionBank, Role } from '../src/shared/types';
import type { GameStore, StoredGame } from './store';

// Framework-agnostic API used by both the Netlify function and the Vite dev server.

const QUESTIONS = new Map((bank as QuestionBank).questions.map((q: Question) => [q.id, q]));
const QUESTION_IDS = [...QUESTIONS.keys()];

export interface ApiResult {
  status: number;
  body: unknown;
}

const ok = (body: unknown): ApiResult => ({ status: 200, body });
const fail = (status: number, error: string): ApiResult => ({ status, body: { error } });

const ctx = (): Ctx => ({ now: Date.now(), random: Math.random, questions: QUESTIONS });
const newToken = () => randomBytes(24).toString('base64url');
const newId = () => randomBytes(6).toString('base64url');
const hash = (t: string) => createHash('sha256').update(t).digest('hex');

function tokenMatches(token: unknown, expectedHash: string | undefined): boolean {
  if (typeof token !== 'string' || !expectedHash) return false;
  const a = Buffer.from(hash(token));
  const b = Buffer.from(expectedHash);
  return a.length === b.length && timingSafeEqual(a, b);
}

function newCode(): string {
  return Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
}

type Body = Record<string, unknown>;

export async function handle(store: GameStore, route: string, body: Body): Promise<ApiResult> {
  try {
    switch (route) {
      case 'create':
        return await create(store);
      case 'join':
        return await join(store, body);
      case 'state':
        return await state(store, body);
      case 'action':
        return await action(store, body);
      case 'secrets':
        return await secrets(store, body);
      default:
        return fail(404, 'Unknown route');
    }
  } catch (e) {
    if (e instanceof GameError) return fail(400, e.message);
    console.error(e);
    return fail(500, 'Something went wrong. Please try again.');
  }
}

async function create(store: GameStore): Promise<ApiResult> {
  const token = newToken();
  for (let attempt = 0; attempt < 12; attempt++) {
    const code = newCode();
    const { state, secrets } = createGame(code, ctx(), QUESTION_IDS);
    if (await store.create(code, { state, secrets, auth: { host: hash(token), players: {} } })) {
      return ok({ code, role: 'host' satisfies Role, playerId: 'host', token });
    }
  }
  return fail(503, 'Could not allocate a game code, please retry');
}

async function loadOr404(store: GameStore, rawCode: unknown): Promise<StoredGame | ApiResult> {
  const code = normalizeCode(String(rawCode ?? ''));
  if (code.length !== CODE_LENGTH) return fail(400, 'Enter the 4-character game code');
  const game = await store.load(code);
  return game ?? fail(404, `No game found with code ${code}`);
}

const isResult = (x: StoredGame | ApiResult): x is ApiResult => 'status' in x;

/** Load → mutate → save with optimistic concurrency, retrying on conflicts. */
async function mutate(
  store: GameStore,
  code: string,
  fn: (game: StoredGame) => Omit<StoredGame, 'version'>,
): Promise<number> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const game = await store.load(code);
    if (!game) throw new GameError('Game not found');
    const next = fn(game);
    const version = await store.save(code, game.version, next);
    if (version !== null) return version;
  }
  throw new GameError('The game is busy, please try again');
}

async function join(store: GameStore, body: Body): Promise<ApiResult> {
  const game = await loadOr404(store, body.code);
  if (isResult(game)) return game;
  const code = game.state.code;

  if (body.role === 'board') {
    return ok({ code, role: 'board' satisfies Role, playerId: `board-${newId()}`, token: '' });
  }

  // Seamless rejoin with an identity this device already holds.
  const rejoin = body.rejoin as { playerId?: string; token?: string } | undefined;
  if (rejoin?.playerId && tokenMatches(rejoin.token, game.auth.players[rejoin.playerId])) {
    if (game.state.players.some((p) => p.id === rejoin.playerId)) {
      return ok({ code, role: 'player', playerId: rejoin.playerId, token: rejoin.token });
    }
  }

  const playerId = newId();
  const token = newToken();
  await mutate(store, code, (g) => {
    const { state, secrets } = applyAction(
      ctx(),
      g.state,
      g.secrets,
      { type: 'addPlayer', playerId, name: String(body.name ?? '') },
      { role: 'system' },
    );
    return { state, secrets, auth: { ...g.auth, players: { ...g.auth.players, [playerId]: hash(token) } } };
  });
  return ok({ code, role: 'player' satisfies Role, playerId, token });
}

async function state(store: GameStore, body: Body): Promise<ApiResult> {
  const game = await loadOr404(store, body.code);
  if (isResult(game)) return game;
  return ok({ state: game.state, version: game.version });
}

function actorFor(game: StoredGame, body: Body): Actor | null {
  if (body.playerId === 'host') return tokenMatches(body.token, game.auth.host) ? { role: 'host' } : null;
  const id = String(body.playerId ?? '');
  if (!tokenMatches(body.token, game.auth.players[id])) return null;
  if (!game.state.players.some((p) => p.id === id)) return null;
  return { role: 'player', playerId: id };
}

async function action(store: GameStore, body: Body): Promise<ApiResult> {
  const game = await loadOr404(store, body.code);
  if (isResult(game)) return game;
  if (!actorFor(game, body)) return fail(403, 'You are no longer in this game');
  const act = body.action as Action;
  if (!act || typeof act.type !== 'string' || act.type === 'addPlayer') return fail(400, 'Bad action');

  const version = await mutate(store, game.state.code, (g) => {
    const actor = actorFor(g, body);
    if (!actor) throw new GameError('You are no longer in this game');
    const { state, secrets } = applyAction(ctx(), g.state, g.secrets, act, actor);
    let auth = g.auth;
    if (act.type === 'kickPlayer' || act.type === 'leave') {
      const gone = act.type === 'leave' ? String(body.playerId) : act.playerId;
      const { [gone]: _removed, ...players } = g.auth.players;
      auth = { ...g.auth, players };
    }
    return { state, secrets, auth };
  });
  return ok({ version });
}

async function secrets(store: GameStore, body: Body): Promise<ApiResult> {
  const game = await loadOr404(store, body.code);
  if (isResult(game)) return game;
  if (!tokenMatches(body.token, game.auth.host)) return fail(403, 'Host only');
  const result: HostSecrets = {
    version: game.version,
    current: game.secrets.current,
    fm: game.secrets.fm,
    canUndo: !!game.secrets.undo,
  };
  return ok(result);
}
