import {
  CODE_LENGTH,
  DEFAULT_SETTINGS,
  FM_QUESTIONS,
  MAX_PLAYERS,
  MAX_STRIKES,
  MAX_TEAM_NAME_LENGTH,
  TEAM_IDS,
  clampSettings,
  cleanName,
  multiplierFor,
  otherTeam,
} from './rules';
import type {
  Action,
  Actor,
  FastMoney,
  GameEventType,
  GameState,
  Phase,
  Player,
  Question,
  Round,
  Secrets,
  TeamId,
} from './types';

// All game rules live here. applyAction is pure: it clones its inputs and returns new state.

export class GameError extends Error {}

export interface Ctx {
  now: number;
  random: () => number;
  questions: Map<string, Question>;
}

type Result = { state: GameState; secrets: Secrets };

/** Judgments the host can take back with Undo. */
const UNDOABLE = new Set<Action['type']>([
  'faceoffJudge',
  'playOrPass',
  'revealAnswer',
  'strike',
  'stealFail',
  'nextRound',
  'adjustScore',
  'fmJudge',
  'fmDuplicate',
]);

const HOST_ONLY = new Set<Action['type']>([
  'setTeamName',
  'assignPlayer',
  'shuffleTeams',
  'updateSettings',
  'kickPlayer',
  'startGame',
  'repickFaceoff',
  'skipQuestion',
  'openBuzzers',
  'resetBuzzers',
  'resolveBuzz',
  'faceoffJudge',
  'revealAnswer',
  'strike',
  'stealFail',
  'revealAll',
  'nextRound',
  'adjustScore',
  'undo',
  'startFastMoney',
  'fmSetPlayers',
  'fmStartTimer',
  'fmJudge',
  'fmDuplicate',
  'fmEndTurn',
  'fmRevealNext',
  'fmContinue',
  'playAgain',
]);

export function createGame(code: string, ctx: Ctx, allQuestionIds: string[]): Result {
  if (code.length !== CODE_LENGTH) throw new GameError('Bad code');
  const state: GameState = {
    code,
    phase: 'LOBBY',
    createdAt: ctx.now,
    settings: { ...DEFAULT_SETTINGS },
    teams: {
      A: { id: 'A', name: 'Team Red', score: 0 },
      B: { id: 'B', name: 'Team Blue', score: 0 },
    },
    players: [],
    roundNumber: 0,
    round: null,
    faceoffCounts: {},
    captainCounts: {},
    winner: null,
    fastMoney: null,
    event: { seq: 0, type: 'none' },
  };
  const secrets: Secrets = {
    deck: shuffle(allQuestionIds, ctx.random),
    used: [],
    current: null,
    fm: null,
    undo: null,
  };
  return { state, secrets };
}

export function applyAction(ctx: Ctx, prevState: GameState, prevSecrets: Secrets, action: Action, actor: Actor): Result {
  if (HOST_ONLY.has(action.type) && actor.role !== 'host') throw new GameError('Only the host can do that');
  if (action.type === 'addPlayer' && actor.role !== 'system') throw new GameError('Not allowed');

  if (action.type === 'undo') return undo(prevState, prevSecrets);

  const state = structuredClone(prevState);
  const secrets = structuredClone(prevSecrets);
  if (UNDOABLE.has(action.type)) {
    const { undo: _drop, ...rest } = prevSecrets;
    secrets.undo = { state: prevState, secrets: structuredClone(rest) };
  }

  const g = new Game(ctx, state, secrets, actor);
  g.run(action);
  return { state, secrets };
}

function undo(prevState: GameState, prevSecrets: Secrets): Result {
  if (!prevSecrets.undo) throw new GameError('Nothing to undo');
  const state = structuredClone(prevSecrets.undo.state);
  const secrets: Secrets = { ...structuredClone(prevSecrets.undo.secrets), undo: null };
  // Players who joined since the snapshot stay in the game.
  for (const p of prevState.players) {
    if (!state.players.some((x) => x.id === p.id)) state.players.push(p);
  }
  state.event = { seq: prevState.event.seq + 1, type: 'undo' };
  return { state, secrets };
}

class Game {
  constructor(
    private ctx: Ctx,
    private s: GameState,
    private sec: Secrets,
    private actor: Actor,
  ) {}

  run(a: Action) {
    switch (a.type) {
      case 'addPlayer':
        return this.addPlayer(a.playerId, a.name);
      case 'leave':
        return this.removePlayer(this.playerId());
      case 'kickPlayer':
        return this.removePlayer(a.playerId);
      case 'setTeamName': {
        const name = cleanName(a.name, MAX_TEAM_NAME_LENGTH);
        if (!name) throw new GameError('Team name required');
        this.s.teams[a.team].name = name;
        return;
      }
      case 'assignPlayer': {
        const p = this.player(a.playerId);
        if (!p) throw new GameError('No such player');
        if (this.s.phase !== 'LOBBY' && this.isActiveInRound(p.id) && p.team !== a.team) {
          throw new GameError(`${p.name} is mid-play; wait for the next round`);
        }
        p.team = a.team;
        return;
      }
      case 'shuffleTeams':
        return this.shuffleTeams();
      case 'updateSettings':
        this.requirePhase('LOBBY');
        this.s.settings = clampSettings({ ...this.s.settings, ...a.settings });
        return;
      case 'startGame':
        return this.startGame();
      case 'repickFaceoff':
        this.requirePhase('FACEOFF_READY');
        this.round().faceoff = this.newFaceoff();
        return;
      case 'skipQuestion':
        this.requirePhase('FACEOFF_READY', 'FACEOFF_OPEN', 'FACEOFF_JUDGING');
        if (this.round().board.some((b) => b.revealed)) throw new GameError('Answers already revealed');
        return this.startRound(this.round().number, this.round().suddenDeath, true);
      case 'openBuzzers':
        return this.openBuzzers();
      case 'resetBuzzers': {
        this.requirePhase('FACEOFF_OPEN', 'FACEOFF_JUDGING');
        const f = this.round().faceoff;
        Object.assign(f, { openedAt: null, buzzes: [], order: [], attempt: 0, misses: [] });
        this.s.phase = 'FACEOFF_READY';
        return;
      }
      case 'buzz':
        return this.buzz(a.reactionMs);
      case 'resolveBuzz':
        return this.resolveBuzz(!!a.force);
      case 'faceoffJudge':
        return this.faceoffJudge(a.correct, a.answerIndex);
      case 'playOrPass':
        return this.playOrPass(a.choice);
      case 'revealAnswer':
        return this.revealAnswer(a.answerIndex);
      case 'strike':
        return this.strike();
      case 'stealFail':
        return this.stealFail();
      case 'revealAll':
        return this.revealAll();
      case 'nextRound':
        return this.nextRound();
      case 'adjustScore':
        this.s.teams[a.team].score = Math.max(0, this.s.teams[a.team].score + Math.round(a.delta));
        return;
      case 'startFastMoney':
        this.requirePhase('GAME_OVER');
        if (!this.s.winner) throw new GameError('No winning team');
        this.s.phase = 'FM_SETUP';
        return;
      case 'fmSetPlayers':
        return this.fmSetPlayers(a.players);
      case 'fmStartTimer':
        return this.fmStartTimer();
      case 'fmAnswer':
        return this.fmAnswer(a.q, a.text);
      case 'fmTimeUp':
        return this.fmTimeUp();
      case 'fmJudge':
        return this.fmJudge(a.player, a.q, a.answerIndex);
      case 'fmDuplicate':
        return this.fmDuplicate(a.q);
      case 'fmEndTurn':
        return this.fmEndTurn();
      case 'fmRevealNext':
        return this.fmRevealNext();
      case 'fmContinue':
        return this.fmContinue();
      case 'playAgain':
        return this.playAgain();
      case 'undo':
        return; // handled before dispatch
    }
  }

  // ---------- helpers ----------

  private emit(type: GameEventType, data?: Record<string, unknown>) {
    this.s.event = { seq: this.s.event.seq + 1, type, ...(data ? { data } : {}) };
  }

  private requirePhase(...phases: Phase[]) {
    if (!phases.includes(this.s.phase)) throw new GameError('Not allowed right now');
  }

  private playerId(): string {
    if (this.actor.role !== 'player') throw new GameError('Players only');
    return this.actor.playerId;
  }

  private player(id: string): Player | undefined {
    return this.s.players.find((p) => p.id === id);
  }

  private round(): Round {
    if (!this.s.round) throw new GameError('No round in progress');
    return this.s.round;
  }

  private teamPlayers(team: TeamId): Player[] {
    return this.s.players.filter((p) => p.team === team);
  }

  private isActiveInRound(id: string): boolean {
    const r = this.s.round;
    if (!r) return false;
    return Object.values(r.faceoff.players).includes(id) || r.turnOrder.includes(id) || r.stealCaptain === id;
  }

  private rand<T>(items: T[]): T {
    return items[Math.floor(this.ctx.random() * items.length)];
  }

  /** Pick a player from a team, preferring whoever has had the fewest turns. */
  private pickRotating(team: TeamId, counts: Record<string, number>): string {
    const players = this.teamPlayers(team);
    if (!players.length) throw new GameError(`${this.s.teams[team].name} has no players`);
    const min = Math.min(...players.map((p) => counts[p.id] ?? 0));
    const pick = this.rand(players.filter((p) => (counts[p.id] ?? 0) === min)).id;
    counts[pick] = (counts[pick] ?? 0) + 1;
    return pick;
  }

  // ---------- lobby ----------

  private addPlayer(id: string, rawName: string) {
    const name = cleanName(rawName);
    if (!name) throw new GameError('Please enter a name');
    if (this.s.players.length >= MAX_PLAYERS) throw new GameError('This game is full');
    if (this.s.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      throw new GameError('That name is taken in this game');
    }
    this.s.players.push({ id, name, team: null, joinedAt: this.ctx.now });
    this.emit('joined', { playerId: id });
  }

  private removePlayer(id: string) {
    const p = this.player(id);
    if (!p) return;
    if (this.s.phase !== 'LOBBY' && this.isActiveInRound(id)) {
      const r = this.round();
      // Keep the round playable: replace them wherever they were needed.
      r.turnOrder = r.turnOrder.filter((x) => x !== id);
      if (r.turn >= r.turnOrder.length) r.turn = 0;
      this.s.players = this.s.players.filter((x) => x.id !== id);
      if (r.stealCaptain === id && p.team && this.teamPlayers(p.team).length) {
        r.stealCaptain = this.pickRotating(p.team, this.s.captainCounts);
      }
      if (Object.values(r.faceoff.players).includes(id) && this.s.phase.startsWith('FACEOFF')) {
        if (TEAM_IDS.every((t) => this.teamPlayers(t).length)) {
          r.faceoff = this.newFaceoff();
          this.s.phase = 'FACEOFF_READY';
        }
      }
    } else {
      this.s.players = this.s.players.filter((x) => x.id !== id);
    }
    delete this.s.faceoffCounts[id];
    delete this.s.captainCounts[id];
  }

  private shuffleTeams() {
    this.requirePhase('LOBBY');
    const order = shuffle(this.s.players.map((p) => p.id), this.ctx.random);
    order.forEach((id, i) => {
      this.player(id)!.team = i % 2 === 0 ? 'A' : 'B';
    });
  }

  private startGame() {
    this.requirePhase('LOBBY');
    for (const t of TEAM_IDS) {
      if (!this.teamPlayers(t).length) throw new GameError('Each team needs at least one player');
    }
    TEAM_IDS.forEach((t) => (this.s.teams[t].score = 0));
    this.s.winner = null;
    this.s.fastMoney = null;
    this.sec.fm = null;
    this.emit('start');
    this.startRound(1, false);
  }

  // ---------- rounds ----------

  private drawQuestion(kind: 'main' | 'fastMoney', exclude: Set<string> = new Set()): Question {
    const fits = (id: string) => {
      const q = this.ctx.questions.get(id);
      return !!q && q.use.includes(kind) && !exclude.has(id);
    };
    let idx = this.sec.deck.findIndex(fits);
    if (idx < 0) {
      // Out of fresh questions: reshuffle the used ones back in.
      this.sec.deck = shuffle([...this.sec.deck, ...this.sec.used], this.ctx.random);
      this.sec.used = [];
      idx = this.sec.deck.findIndex(fits);
      if (idx < 0) throw new GameError(`No ${kind} questions available`);
    }
    const [id] = this.sec.deck.splice(idx, 1);
    this.sec.used.push(id);
    return this.ctx.questions.get(id)!;
  }

  private startRound(number: number, suddenDeath: boolean, keepFaceoff = false) {
    const q = this.drawQuestion('main');
    this.sec.current = q;
    const prev = this.s.round;
    this.s.roundNumber = number;
    this.s.round = {
      number,
      multiplier: suddenDeath ? Math.max(...this.s.settings.multipliers, 1) : multiplierFor(this.s.settings, number),
      suddenDeath,
      question: { id: q.id, text: q.text, answerCount: q.answers.length },
      board: q.answers.map(() => ({ text: null, points: null, revealed: false, by: null })),
      bank: 0,
      strikes: 0,
      faceoff: keepFaceoff && prev ? resetFaceoff(prev.faceoff) : this.newFaceoff(),
      control: null,
      turnOrder: [],
      turn: 0,
      stealCaptain: null,
      result: null,
    };
    this.s.phase = 'FACEOFF_READY';
    this.emit('roundStart', { number });
  }

  private newFaceoff() {
    return resetFaceoff({
      players: { A: this.pickRotating('A', this.s.faceoffCounts), B: this.pickRotating('B', this.s.faceoffCounts) },
      openedAt: null,
      buzzes: [],
      order: [],
      attempt: 0,
      misses: [],
      winner: null,
    });
  }

  private openBuzzers() {
    this.requirePhase('FACEOFF_READY');
    const f = this.round().faceoff;
    f.openedAt = this.ctx.now;
    f.buzzes = [];
    this.s.phase = 'FACEOFF_OPEN';
    this.emit('buzzersOpen');
  }

  private buzz(reactionMs: number) {
    const id = this.playerId();
    this.requirePhase('FACEOFF_OPEN');
    const f = this.round().faceoff;
    const team = TEAM_IDS.find((t) => f.players[t] === id);
    if (!team) throw new GameError("You're not in this face-off");
    if (f.buzzes.some((b) => b.playerId === id)) return;
    const ms = Math.min(120_000, Math.max(0, Math.round(Number(reactionMs) || 0)));
    f.buzzes.push({ playerId: id, team, reactionMs: ms, at: this.ctx.now });
    this.emit('buzz', { playerId: id, reactionMs: ms });
    if (f.buzzes.length === 2) this.finishBuzzing();
  }

  private resolveBuzz(force: boolean) {
    if (this.s.phase !== 'FACEOFF_OPEN') return; // already resolved by the second buzz
    const f = this.round().faceoff;
    if (!f.buzzes.length) throw new GameError('Nobody has buzzed yet');
    const waited = this.ctx.now - f.buzzes[0].at;
    if (!force && waited < this.s.settings.buzzGraceMs - 250) throw new GameError('Still waiting for the other buzzer');
    this.finishBuzzing();
  }

  private finishBuzzing() {
    const f = this.round().faceoff;
    const fastest = [...f.buzzes].sort((a, b) => a.reactionMs - b.reactionMs).map((b) => b.playerId);
    // The other face-off player gets their chance if the first answer misses, buzzed or not.
    const rest = TEAM_IDS.map((t) => f.players[t]).filter((id) => !fastest.includes(id));
    f.order = [...fastest, ...rest];
    f.attempt = 0;
    this.s.phase = 'FACEOFF_JUDGING';
    this.emit('buzzResolved', { playerId: f.order[0] });
  }

  private faceoffJudge(correct: boolean, answerIndex?: number) {
    this.requirePhase('FACEOFF_JUDGING');
    const r = this.round();
    const f = r.faceoff;
    const answerer = f.order[f.attempt];
    const team = TEAM_IDS.find((t) => f.players[t] === answerer)!;
    if (correct) {
      if (answerIndex === undefined) throw new GameError('Pick the matching answer');
      this.revealSlot(answerIndex, team);
      f.winner = team;
      this.s.phase = 'PLAY_OR_PASS';
      this.emit('reveal', { index: answerIndex, team, faceoff: true });
      return;
    }
    f.misses.push(answerer);
    f.attempt++;
    if (f.attempt >= f.order.length) {
      // Both missed: bring up a new pair on the same question.
      r.faceoff = this.newFaceoff();
      this.s.phase = 'FACEOFF_READY';
      this.emit('faceoffWrong', { playerId: answerer, bothWrong: true });
    } else {
      this.emit('faceoffWrong', { playerId: answerer, bothWrong: false });
    }
  }

  private playOrPass(choice: 'play' | 'pass') {
    this.requirePhase('PLAY_OR_PASS');
    const r = this.round();
    const winner = r.faceoff.winner!;
    if (this.actor.role === 'player' && this.actor.playerId !== r.faceoff.players[winner]) {
      throw new GameError('Only the face-off winner decides');
    }
    const control = choice === 'play' ? winner : otherTeam(winner);
    r.control = control;
    // Play passes down the line, starting after this team's face-off player.
    const players = this.teamPlayers(control).map((p) => p.id);
    const start = players.indexOf(r.faceoff.players[control]);
    r.turnOrder = start < 0 ? players : [...players.slice(start + 1), ...players.slice(0, start + 1)];
    r.turn = 0;
    this.s.phase = 'ROUND_PLAY';
    this.emit('start', { control, choice });
    if (r.board.every((b) => b.revealed)) this.award(control, false);
  }

  private revealSlot(i: number, by: TeamId | null) {
    const r = this.round();
    const ans = this.sec.current?.answers[i];
    const slot = r.board[i];
    if (!ans || !slot) throw new GameError('No such answer');
    if (slot.revealed) throw new GameError('Already revealed');
    Object.assign(slot, { text: ans.text, points: ans.count, revealed: true, by });
    if (by) r.bank += ans.count;
  }

  private revealAnswer(i: number) {
    const r = this.round();
    switch (this.s.phase) {
      case 'ROUND_PLAY': {
        this.revealSlot(i, r.control);
        r.turn = (r.turn + 1) % Math.max(1, r.turnOrder.length);
        this.emit('reveal', { index: i, team: r.control });
        if (r.board.every((b) => b.revealed)) this.award(r.control!, false);
        return;
      }
      case 'STEAL': {
        const thief = otherTeam(r.control!);
        this.revealSlot(i, thief);
        this.award(thief, true);
        this.emit('steal', { index: i, team: thief, points: r.result!.points });
        return;
      }
      case 'ROUND_END':
        this.revealSlot(i, null);
        this.emit('reveal', { index: i, team: null });
        return;
      default:
        throw new GameError('Not allowed right now');
    }
  }

  private strike() {
    this.requirePhase('ROUND_PLAY');
    const r = this.round();
    r.strikes++;
    r.turn = (r.turn + 1) % Math.max(1, r.turnOrder.length);
    this.emit('strike', { count: r.strikes });
    if (r.strikes >= MAX_STRIKES) {
      const thief = otherTeam(r.control!);
      r.stealCaptain = this.pickRotating(thief, this.s.captainCounts);
      this.s.phase = 'STEAL';
    }
  }

  private stealFail() {
    this.requirePhase('STEAL');
    const r = this.round();
    this.award(r.control!, false);
    this.emit('stealFail', { team: r.control, points: r.result!.points });
  }

  private award(team: TeamId, stolen: boolean) {
    const r = this.round();
    const points = r.bank * r.multiplier;
    this.s.teams[team].score += points;
    r.result = { team, points, stolen };
    this.s.phase = 'ROUND_END';
    this.emit('award', { team, points, stolen });
  }

  private revealAll() {
    this.requirePhase('ROUND_END');
    const r = this.round();
    r.board.forEach((b, i) => {
      if (!b.revealed) this.revealSlot(i, null);
    });
    this.emit('reveal', { all: true });
  }

  private nextRound() {
    this.requirePhase('ROUND_END');
    const { settings, teams } = this.s;
    const a = teams.A.score;
    const b = teams.B.score;
    const leader: TeamId | null = a === b ? null : a > b ? 'A' : 'B';
    const n = this.s.roundNumber;
    const reachedTarget = settings.targetScore > 0 && Math.max(a, b) >= settings.targetScore;
    const roundsDone = settings.targetScore === 0 && n >= settings.rounds;
    if (reachedTarget || roundsDone || this.s.round?.suddenDeath) {
      if (leader) {
        this.s.winner = leader;
        this.s.phase = 'GAME_OVER';
        this.emit('gameOver', { team: leader });
        return;
      }
      return this.startRound(n + 1, true);
    }
    this.startRound(n + 1, false);
  }

  // ---------- fast money ----------

  private fm(): FastMoney {
    if (!this.s.fastMoney || !this.sec.fm) throw new GameError('Fast Money has not started');
    return this.s.fastMoney;
  }

  private fmSetPlayers(players: [string, string]) {
    this.requirePhase('FM_SETUP');
    const team = this.s.winner!;
    const roster = this.teamPlayers(team).map((p) => p.id);
    if (!players.every((p) => roster.includes(p))) throw new GameError('Pick players from the winning team');
    if (players[0] === players[1] && roster.length > 1) throw new GameError('Pick two different players');
    const exclude = new Set<string>();
    const qs: Question[] = [];
    for (let i = 0; i < FM_QUESTIONS; i++) {
      const q = this.drawQuestion('fastMoney', exclude);
      exclude.add(q.id);
      qs.push(q);
    }
    const blankSecret = () => qs.map(() => ({ text: null, matched: null, points: 0 }));
    const blankPublic = () => qs.map(() => ({ answered: false, judged: false, text: null, points: null }));
    this.sec.fm = { questions: qs, entries: [blankSecret(), blankSecret()] };
    this.s.fastMoney = {
      players,
      questions: qs.map((q) => ({ id: q.id, text: q.text })),
      current: 0,
      timerStartedAt: null,
      timeUp: false,
      entries: [blankPublic(), blankPublic()],
      revealStep: 0,
      totals: [0, 0],
      won: null,
    };
    this.s.phase = 'FM_P1';
    this.emit('fmStart');
  }

  private fmStartTimer() {
    this.requirePhase('FM_P1', 'FM_P2');
    const fm = this.fm();
    fm.timerStartedAt = this.ctx.now;
    fm.timeUp = false;
    this.emit('fmTimer');
  }

  private fmAnswer(q: number, raw: string) {
    this.requirePhase('FM_P1', 'FM_P2');
    const fm = this.fm();
    const id = this.playerId();
    if (fm.players[fm.current] !== id) throw new GameError("It's not your turn");
    if (fm.timerStartedAt === null) throw new GameError('Wait for the host to start the clock');
    if (fm.timeUp) throw new GameError("Time's up");
    const text = cleanName(raw, 40);
    const pub = fm.entries[fm.current][q];
    if (!pub || !text) throw new GameError('No answer');
    if (pub.answered) throw new GameError('Already answered');
    this.sec.fm!.entries[fm.current][q] = { text, matched: null, points: 0 };
    pub.answered = true;
    pub.judged = false;
    this.emit('fmAnswer', { q });
  }

  private fmTimeUp() {
    this.requirePhase('FM_P1', 'FM_P2');
    const fm = this.fm();
    if (this.actor.role === 'player' && fm.players[fm.current] !== this.actor.playerId) {
      throw new GameError("It's not your turn");
    }
    fm.timeUp = true;
  }

  private fmJudge(player: 0 | 1, q: number, answerIndex: number) {
    this.requirePhase('FM_P1', 'FM_P2', 'FM_P1_REVEAL', 'FM_P2_REVEAL');
    const fm = this.fm();
    const pub = fm.entries[player]?.[q];
    const sec = this.sec.fm!.entries[player]?.[q];
    if (!pub || !sec) throw new GameError('No such answer');
    if (!pub.answered) throw new GameError('No answer to judge');
    const question = this.sec.fm!.questions[q];
    if (answerIndex >= 0 && !question.answers[answerIndex]) throw new GameError('No such survey answer');
    sec.matched = answerIndex >= 0 ? answerIndex : null;
    sec.points = answerIndex >= 0 ? question.answers[answerIndex].count : 0;
    pub.judged = true;
    // Fix up an already revealed score if the host changes their mind.
    if (pub.points !== null) {
      pub.points = sec.points;
      fm.totals[player] = fm.entries[player].reduce((s, e) => s + (e.points ?? 0), 0);
    }
  }

  private fmDuplicate(q: number) {
    this.requirePhase('FM_P2');
    const fm = this.fm();
    const pub = fm.entries[1][q];
    if (!pub?.answered) throw new GameError('No answer to reject');
    this.sec.fm!.entries[1][q] = { text: null, matched: null, points: 0 };
    Object.assign(pub, { answered: false, judged: false });
    this.emit('fmDuplicate', { q });
  }

  private fmEndTurn() {
    this.requirePhase('FM_P1', 'FM_P2');
    const fm = this.fm();
    const p = fm.current;
    if (fm.entries[p].some((e) => e.answered && !e.judged)) throw new GameError('Judge every answer first');
    for (const e of fm.entries[p]) {
      if (!e.answered) e.judged = true; // blank answers score zero
    }
    fm.timeUp = true;
    fm.revealStep = 0;
    if (p === 1) this.fmRestoreTexts(0);
    this.s.phase = p === 0 ? 'FM_P1_REVEAL' : 'FM_P2_REVEAL';
  }

  /** Reveal steps alternate: answer text, then its points, for each of the five questions. */
  private fmRevealNext() {
    this.requirePhase('FM_P1_REVEAL', 'FM_P2_REVEAL');
    const fm = this.fm();
    const p = fm.current;
    if (fm.revealStep >= FM_QUESTIONS * 2) return;
    const q = Math.floor(fm.revealStep / 2);
    const pub = fm.entries[p][q];
    const sec = this.sec.fm!.entries[p][q];
    if (fm.revealStep % 2 === 0) {
      pub.text = sec.text ?? '—';
      this.emit('fmReveal', { player: p, q, part: 'text' });
    } else {
      pub.points = sec.points;
      fm.totals[p] += sec.points;
      const grand = fm.totals[0] + fm.totals[1];
      const justWon = p === 1 && grand >= this.s.settings.fmTarget && grand - sec.points < this.s.settings.fmTarget;
      this.emit(justWon ? 'fmWin' : 'fmReveal', { player: p, q, part: 'points', points: sec.points });
    }
    fm.revealStep++;
  }

  private fmRevealAll() {
    while (this.fm().revealStep < FM_QUESTIONS * 2) this.fmRevealNext();
  }

  private fmRestoreTexts(p: 0 | 1) {
    const fm = this.fm();
    fm.entries[p].forEach((e, q) => {
      e.text = this.sec.fm!.entries[p][q].text ?? '—';
    });
  }

  private fmContinue() {
    this.requirePhase('FM_P1_REVEAL', 'FM_P2_REVEAL');
    const fm = this.fm();
    this.fmRevealAll();
    if (this.s.phase === 'FM_P1_REVEAL') {
      // Cover player one's answers while player two plays.
      fm.entries[0].forEach((e) => (e.text = null));
      fm.current = 1;
      fm.timerStartedAt = null;
      fm.timeUp = false;
      fm.revealStep = 0;
      this.s.phase = 'FM_P2';
      this.emit('fmStart', { player: 1 });
      return;
    }
    fm.won = fm.totals[0] + fm.totals[1] >= this.s.settings.fmTarget;
    this.s.phase = 'FM_END';
    this.emit(fm.won ? 'fmWin' : 'fmLose', { total: fm.totals[0] + fm.totals[1] });
  }

  private playAgain() {
    TEAM_IDS.forEach((t) => (this.s.teams[t].score = 0));
    Object.assign(this.s, { phase: 'LOBBY', roundNumber: 0, round: null, winner: null, fastMoney: null });
    this.sec.current = null;
    this.sec.fm = null;
    this.sec.undo = null;
    this.emit('none');
  }
}

function resetFaceoff<T extends Round['faceoff']>(f: T): T {
  return { ...f, openedAt: null, buzzes: [], order: [], attempt: 0, misses: [], winner: null };
}

export function shuffle<T>(items: T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
