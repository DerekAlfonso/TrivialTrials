import { describe, expect, it } from 'vitest';
import { applyAction, createGame, GameError, type Ctx } from './reducer';
import type { Action, Actor, GameState, Question, Secrets } from './types';
import { suggestMatches } from './match';

function q(id: string, use: Question['use'] = ['main', 'fastMoney']): Question {
  return {
    id,
    text: `Question ${id}`,
    category: 'Test',
    use,
    surveyed: 100,
    answers: [
      { text: 'Alpha', count: 40 },
      { text: 'Bravo', count: 30 },
      { text: 'Charlie', count: 20 },
      { text: 'Delta', count: 10 },
    ],
  };
}

const QUESTIONS = new Map(Array.from({ length: 20 }, (_, i) => q(`q${i}`)).map((x) => [x.id, x]));
const HOST: Actor = { role: 'host' };
const P = (id: string): Actor => ({ role: 'player', playerId: id });

class Harness {
  now = 1_000;
  state: GameState;
  secrets: Secrets;
  private seed = 1;
  ctx = (): Ctx => ({
    now: this.now,
    random: () => {
      this.seed = (this.seed * 16807) % 2147483647;
      return (this.seed - 1) / 2147483646;
    },
    questions: QUESTIONS,
  });

  constructor() {
    ({ state: this.state, secrets: this.secrets } = createGame('ABCD', this.ctx(), [...QUESTIONS.keys()]));
  }

  act(action: Action, actor: Actor = HOST) {
    ({ state: this.state, secrets: this.secrets } = applyAction(this.ctx(), this.state, this.secrets, action, actor));
    return this;
  }

  get round() {
    return this.state.round!;
  }

  /** Lobby with a 2v2 game started. */
  static started() {
    const h = new Harness();
    for (const [id, name, team] of [
      ['a1', 'Ann', 'A'],
      ['a2', 'Al', 'A'],
      ['b1', 'Bea', 'B'],
      ['b2', 'Bo', 'B'],
    ] as const) {
      h.act({ type: 'addPlayer', playerId: id, name }, { role: 'system' });
      h.act({ type: 'assignPlayer', playerId: id, team });
    }
    h.act({ type: 'startGame' });
    return h;
  }

  /** Face-off won by team A on the top answer, team A plays. */
  static playing() {
    const h = Harness.started();
    const fa = h.round.faceoff.players;
    h.act({ type: 'openBuzzers' });
    h.act({ type: 'buzz', reactionMs: 300 }, P(fa.A));
    h.act({ type: 'buzz', reactionMs: 500 }, P(fa.B));
    h.act({ type: 'faceoffJudge', correct: true, answerIndex: 0 });
    h.act({ type: 'playOrPass', choice: 'play' }, P(fa.A));
    return h;
  }
}

describe('lobby', () => {
  it('rejects duplicate names and non-host actions', () => {
    const h = new Harness();
    h.act({ type: 'addPlayer', playerId: 'x', name: 'Sam' }, { role: 'system' });
    expect(() => h.act({ type: 'addPlayer', playerId: 'y', name: 'sam ' }, { role: 'system' })).toThrow(GameError);
    expect(() => h.act({ type: 'startGame' }, P('x'))).toThrow(/host/);
  });

  it('needs a player on each team to start', () => {
    const h = new Harness();
    h.act({ type: 'addPlayer', playerId: 'x', name: 'Sam' }, { role: 'system' });
    h.act({ type: 'assignPlayer', playerId: 'x', team: 'A' });
    expect(() => h.act({ type: 'startGame' })).toThrow(/Each team/);
  });

  it('starts round 1 with one face-off player per team', () => {
    const h = Harness.started();
    expect(h.state.phase).toBe('FACEOFF_READY');
    expect(['a1', 'a2']).toContain(h.round.faceoff.players.A);
    expect(['b1', 'b2']).toContain(h.round.faceoff.players.B);
    expect(h.round.board).toHaveLength(4);
    expect(h.round.board.every((b) => b.text === null)).toBe(true);
  });
});

describe('face-off', () => {
  it('fastest device reaction time answers first, regardless of arrival order', () => {
    const h = Harness.started();
    const fa = h.round.faceoff.players;
    h.act({ type: 'openBuzzers' });
    h.act({ type: 'buzz', reactionMs: 900 }, P(fa.A));
    h.act({ type: 'buzz', reactionMs: 400 }, P(fa.B));
    expect(h.state.phase).toBe('FACEOFF_JUDGING');
    expect(h.round.faceoff.order[0]).toBe(fa.B);
  });

  it('only face-off players can buzz', () => {
    const h = Harness.started();
    h.act({ type: 'openBuzzers' });
    const other = ['a1', 'a2'].find((id) => id !== h.round.faceoff.players.A)!;
    expect(() => h.act({ type: 'buzz', reactionMs: 1 }, P(other))).toThrow(/face-off/);
  });

  it('waits for the grace window before resolving a single buzz', () => {
    const h = Harness.started();
    const fa = h.round.faceoff.players;
    h.act({ type: 'openBuzzers' });
    h.act({ type: 'buzz', reactionMs: 300 }, P(fa.A));
    expect(() => h.act({ type: 'resolveBuzz' })).toThrow(/waiting/);
    h.now += 2_000;
    h.act({ type: 'resolveBuzz' });
    expect(h.round.faceoff.order).toEqual([fa.A, fa.B]);
  });

  it('wrong answer passes to the other player; correct wins the face-off and banks points', () => {
    const h = Harness.started();
    const fa = h.round.faceoff.players;
    h.act({ type: 'openBuzzers' });
    h.act({ type: 'buzz', reactionMs: 300 }, P(fa.A));
    h.act({ type: 'buzz', reactionMs: 500 }, P(fa.B));
    h.act({ type: 'faceoffJudge', correct: false });
    expect(h.state.phase).toBe('FACEOFF_JUDGING');
    expect(h.state.event.type).toBe('faceoffWrong');
    h.act({ type: 'faceoffJudge', correct: true, answerIndex: 2 });
    expect(h.state.phase).toBe('PLAY_OR_PASS');
    expect(h.round.faceoff.winner).toBe('B');
    expect(h.round.bank).toBe(20);
    expect(h.round.board[2]).toMatchObject({ text: 'Charlie', revealed: true, by: 'B' });
  });

  it('both wrong brings up a fresh pair on the same question', () => {
    const h = Harness.started();
    const qid = h.round.question.id;
    const fa = h.round.faceoff.players;
    h.act({ type: 'openBuzzers' });
    h.act({ type: 'buzz', reactionMs: 300 }, P(fa.A));
    h.act({ type: 'buzz', reactionMs: 500 }, P(fa.B));
    h.act({ type: 'faceoffJudge', correct: false });
    h.act({ type: 'faceoffJudge', correct: false });
    expect(h.state.phase).toBe('FACEOFF_READY');
    expect(h.round.question.id).toBe(qid);
    expect(h.round.faceoff.players.A).not.toBe(fa.A); // rotation picks the teammate
  });

  it('pass hands control to the other team', () => {
    const h = Harness.started();
    const fa = h.round.faceoff.players;
    h.act({ type: 'openBuzzers' });
    h.act({ type: 'buzz', reactionMs: 300 }, P(fa.A));
    h.act({ type: 'buzz', reactionMs: 500 }, P(fa.B));
    h.act({ type: 'faceoffJudge', correct: true, answerIndex: 1 });
    expect(() => h.act({ type: 'playOrPass', choice: 'pass' }, P(fa.B))).toThrow(/winner/);
    h.act({ type: 'playOrPass', choice: 'pass' }, P(fa.A));
    expect(h.round.control).toBe('B');
    expect(h.round.turnOrder).toHaveLength(2);
  });
});

describe('main round', () => {
  it('revealing every answer awards the bank to the controlling team', () => {
    const h = Harness.playing();
    h.act({ type: 'revealAnswer', answerIndex: 1 });
    h.act({ type: 'strike' });
    h.act({ type: 'revealAnswer', answerIndex: 2 });
    h.act({ type: 'revealAnswer', answerIndex: 3 });
    expect(h.state.phase).toBe('ROUND_END');
    expect(h.state.teams.A.score).toBe(100);
    expect(h.round.result).toEqual({ team: 'A', points: 100, stolen: false });
  });

  it('three strikes opens a steal; a correct steal takes the whole bank', () => {
    const h = Harness.playing();
    h.act({ type: 'revealAnswer', answerIndex: 1 }); // bank 70
    h.act({ type: 'strike' }).act({ type: 'strike' }).act({ type: 'strike' });
    expect(h.state.phase).toBe('STEAL');
    expect(['b1', 'b2']).toContain(h.round.stealCaptain);
    h.act({ type: 'revealAnswer', answerIndex: 3 }); // +10
    expect(h.state.teams.B.score).toBe(80);
    expect(h.state.teams.A.score).toBe(0);
    expect(h.round.result?.stolen).toBe(true);
  });

  it('a failed steal gives the bank to the controlling team', () => {
    const h = Harness.playing();
    h.act({ type: 'strike' }).act({ type: 'strike' }).act({ type: 'strike' });
    h.act({ type: 'stealFail' });
    expect(h.state.teams.A.score).toBe(40);
  });

  it('end-of-round reveals carry no points', () => {
    const h = Harness.playing();
    h.act({ type: 'strike' }).act({ type: 'strike' }).act({ type: 'strike' }).act({ type: 'stealFail' });
    h.act({ type: 'revealAll' });
    expect(h.round.board.every((b) => b.revealed)).toBe(true);
    expect(h.state.teams.A.score).toBe(40);
    expect(h.state.teams.B.score).toBe(0);
  });

  it('applies round multipliers', () => {
    const h = Harness.playing();
    h.act({ type: 'strike' }).act({ type: 'strike' }).act({ type: 'strike' }).act({ type: 'stealFail' });
    h.act({ type: 'nextRound' });
    expect(h.round.number).toBe(2);
    expect(() => h.act({ type: 'nextRound' })).toThrow(/right now/); // not allowed mid-faceoff
  });

  it('undo restores the previous judgment', () => {
    const h = Harness.playing();
    h.act({ type: 'strike' });
    expect(h.round.strikes).toBe(1);
    h.act({ type: 'undo' });
    expect(h.round.strikes).toBe(0);
    expect(() => h.act({ type: 'undo' })).toThrow(/Nothing/);
  });
});

function finishRound(h: Harness, winner: 'A' | 'B') {
  const fa = h.round.faceoff.players;
  h.act({ type: 'openBuzzers' });
  h.act({ type: 'buzz', reactionMs: 100 }, P(fa[winner]));
  h.now += 5000;
  h.act({ type: 'resolveBuzz' });
  h.act({ type: 'faceoffJudge', correct: true, answerIndex: 0 });
  h.act({ type: 'playOrPass', choice: 'play' });
  for (let i = 1; i < 4; i++) h.act({ type: 'revealAnswer', answerIndex: i });
  h.act({ type: 'nextRound' });
}

describe('game end', () => {
  it('multipliers 1,1,2,3 and the winner after four rounds', () => {
    const h = Harness.started();
    finishRound(h, 'A'); // 100
    finishRound(h, 'B'); // 100
    finishRound(h, 'A'); // 200
    expect(h.round.multiplier).toBe(3);
    finishRound(h, 'A'); // 300
    expect(h.state.phase).toBe('GAME_OVER');
    expect(h.state.winner).toBe('A');
    expect(h.state.teams.A.score).toBe(600);
  });

  it('a tie after the last round goes to sudden death', () => {
    const h = Harness.started();
    finishRound(h, 'A'); // A 100
    finishRound(h, 'B'); // B 100
    // rounds 3 (x2) and 4 (x3) split so the totals end level
    finishRound(h, 'A'); // A 300
    h.act({ type: 'adjustScore', team: 'B', delta: -100 });
    finishRound(h, 'B'); // B 0 + 300
    expect(h.state.teams.A.score).toBe(300);
    expect(h.state.teams.B.score).toBe(300);
    expect(h.state.phase).toBe('FACEOFF_READY');
    expect(h.round.suddenDeath).toBe(true);
    finishRound(h, 'B');
    expect(h.state.winner).toBe('B');
  });

  it('target score mode ends as soon as a team passes it', () => {
    const h = Harness.started();
    h.act({ type: 'playAgain' });
    h.act({ type: 'updateSettings', settings: { targetScore: 150 } });
    h.act({ type: 'startGame' });
    finishRound(h, 'A');
    expect(h.state.phase).toBe('FACEOFF_READY');
    finishRound(h, 'A');
    expect(h.state.phase).toBe('GAME_OVER');
  });
});

describe('fast money', () => {
  function toFastMoney() {
    const h = Harness.started();
    for (let i = 0; i < 4; i++) finishRound(h, 'A');
    h.act({ type: 'startFastMoney' });
    h.act({ type: 'fmSetPlayers', players: ['a1', 'a2'] });
    return h;
  }

  it('hides answers until revealed, then totals both players', () => {
    const h = toFastMoney();
    expect(h.state.phase).toBe('FM_P1');
    expect(() => h.act({ type: 'fmAnswer', q: 0, text: 'alpha' }, P('a1'))).toThrow(/clock/);
    h.act({ type: 'fmStartTimer' });
    expect(() => h.act({ type: 'fmAnswer', q: 0, text: 'x' }, P('a2'))).toThrow(/turn/);
    h.act({ type: 'fmAnswer', q: 0, text: 'alpha' }, P('a1'));
    h.act({ type: 'fmAnswer', q: 1, text: 'bravo' }, P('a1'));
    expect(JSON.stringify(h.state)).not.toContain('alpha');
    expect(() => h.act({ type: 'fmEndTurn' })).toThrow(/Judge/);
    h.act({ type: 'fmJudge', player: 0, q: 0, answerIndex: 0 });
    h.act({ type: 'fmJudge', player: 0, q: 1, answerIndex: 1 });
    h.act({ type: 'fmEndTurn' });
    expect(h.state.phase).toBe('FM_P1_REVEAL');
    h.act({ type: 'fmRevealNext' });
    expect(h.state.fastMoney!.entries[0][0].text).toBe('alpha');
    expect(h.state.fastMoney!.entries[0][0].points).toBeNull();
    h.act({ type: 'fmContinue' });
    expect(h.state.fastMoney!.totals[0]).toBe(70);
    // Player one's answers are covered while player two plays
    expect(h.state.phase).toBe('FM_P2');
    expect(h.state.fastMoney!.entries[0][0].text).toBeNull();
    h.act({ type: 'fmStartTimer' });
    h.act({ type: 'fmAnswer', q: 0, text: 'alpha' }, P('a2'));
    h.act({ type: 'fmDuplicate', q: 0 });
    expect(h.state.fastMoney!.entries[1][0].answered).toBe(false);
    for (let i = 0; i < 5; i++) {
      h.act({ type: 'fmAnswer', q: i, text: `ans${i}` }, P('a2'));
      h.act({ type: 'fmJudge', player: 1, q: i, answerIndex: 0 });
    }
    h.act({ type: 'fmEndTurn' });
    expect(h.state.fastMoney!.entries[0][0].text).toBe('alpha');
    h.act({ type: 'fmContinue' });
    expect(h.state.fastMoney!.totals).toEqual([70, 200]);
    expect(h.state.fastMoney!.won).toBe(true);
    expect(h.state.phase).toBe('FM_END');
  });

  it('uses only fast-money questions not seen in the main game', () => {
    const h = toFastMoney();
    const mainIds = new Set(h.secrets.used.slice(0, 4));
    expect(h.state.fastMoney!.questions.every((x) => !mainIds.has(x.id))).toBe(true);
    expect(new Set(h.state.fastMoney!.questions.map((x) => x.id)).size).toBe(5);
  });
});

describe('answer matching', () => {
  const answers = [
    { text: 'Towel', count: 38, aliases: ['beach towel'] },
    { text: 'Sunscreen', count: 24, aliases: ['sunblock', 'lotion'] },
    { text: 'Umbrella', count: 14 },
  ];
  it('finds exact, alias, plural and typo matches', () => {
    expect(suggestMatches('towels', answers)[0].index).toBe(0);
    expect(suggestMatches('Sun block', answers)[0].index).toBe(1);
    expect(suggestMatches('umbrela', answers)[0].index).toBe(2);
    expect(suggestMatches('a big towel', answers)[0].index).toBe(0);
    expect(suggestMatches('volleyball', answers)).toEqual([]);
  });
});
