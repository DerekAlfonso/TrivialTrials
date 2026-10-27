// Types shared by the browser and the server. Public state (GameState) is visible to every
// device; Secrets never leave the server except through the host-only secrets endpoint.

export type TeamId = 'A' | 'B';
export type Role = 'host' | 'player' | 'board';

export type Phase =
  | 'LOBBY'
  | 'FACEOFF_READY'
  | 'FACEOFF_OPEN'
  | 'FACEOFF_JUDGING'
  | 'PLAY_OR_PASS'
  | 'ROUND_PLAY'
  | 'STEAL'
  | 'ROUND_END'
  | 'GAME_OVER'
  | 'FM_SETUP'
  | 'FM_P1'
  | 'FM_P1_REVEAL'
  | 'FM_P2'
  | 'FM_P2_REVEAL'
  | 'FM_END';

// ---------- Question bank (data/questions.json) ----------

export interface SurveyAnswer {
  text: string;
  count: number;
  aliases?: string[];
}

export interface Question {
  id: string;
  text: string;
  category: string;
  use: ('main' | 'fastMoney')[];
  surveyed: number;
  answers: SurveyAnswer[];
}

export interface QuestionBank {
  version: number;
  questions: Question[];
}

// ---------- Public state ----------

export interface Settings {
  /** Number of main rounds when targetScore is 0. */
  rounds: number;
  /** Point multiplier per round; the last value repeats for extra rounds. */
  multipliers: number[];
  /** First team to reach this wins. 0 = play a fixed number of rounds. */
  targetScore: number;
  fastMoney: boolean;
  fmSeconds: [number, number];
  fmTarget: number;
  /** How long after the first buzz the host device waits for the second one. */
  buzzGraceMs: number;
}

export interface Player {
  id: string;
  name: string;
  team: TeamId | null;
  joinedAt: number;
}

export interface Team {
  id: TeamId;
  name: string;
  score: number;
}

export interface BoardSlot {
  text: string | null;
  points: number | null;
  revealed: boolean;
  /** Team that earned it; null when revealed at the end of the round without points. */
  by: TeamId | null;
}

export interface Buzz {
  playerId: string;
  team: TeamId;
  /** Measured on the buzzing device from the moment its buzzer lit up. */
  reactionMs: number;
  at: number;
}

export interface Faceoff {
  players: Record<TeamId, string>;
  openedAt: number | null;
  buzzes: Buzz[];
  /** Answering order once buzzers resolve (fastest first). */
  order: string[];
  attempt: number;
  misses: string[];
  winner: TeamId | null;
}

export interface RoundResult {
  team: TeamId | null;
  points: number;
  stolen: boolean;
}

export interface Round {
  number: number;
  multiplier: number;
  suddenDeath: boolean;
  question: { id: string; text: string; answerCount: number };
  board: BoardSlot[];
  bank: number;
  strikes: number;
  faceoff: Faceoff;
  control: TeamId | null;
  turnOrder: string[];
  turn: number;
  stealCaptain: string | null;
  result: RoundResult | null;
}

export interface FmPublicEntry {
  answered: boolean;
  judged: boolean;
  /** Filled in only when revealed. */
  text: string | null;
  points: number | null;
}

export interface FastMoney {
  players: [string, string];
  questions: { id: string; text: string }[];
  /** Index (0/1) of the player currently answering or being revealed. */
  current: 0 | 1;
  timerStartedAt: number | null;
  timeUp: boolean;
  entries: [FmPublicEntry[], FmPublicEntry[]];
  revealStep: number;
  totals: [number, number];
  won: boolean | null;
}

export type GameEventType =
  | 'none'
  | 'joined'
  | 'start'
  | 'buzzersOpen'
  | 'buzz'
  | 'buzzResolved'
  | 'reveal'
  | 'strike'
  | 'faceoffWrong'
  | 'award'
  | 'steal'
  | 'stealFail'
  | 'roundStart'
  | 'gameOver'
  | 'fmStart'
  | 'fmTimer'
  | 'fmAnswer'
  | 'fmDuplicate'
  | 'fmReveal'
  | 'fmWin'
  | 'fmLose'
  | 'undo';

export interface GameEvent {
  seq: number;
  type: GameEventType;
  data?: Record<string, unknown>;
}

export interface GameState {
  code: string;
  phase: Phase;
  createdAt: number;
  settings: Settings;
  teams: Record<TeamId, Team>;
  players: Player[];
  roundNumber: number;
  round: Round | null;
  faceoffCounts: Record<string, number>;
  captainCounts: Record<string, number>;
  winner: TeamId | null;
  fastMoney: FastMoney | null;
  event: GameEvent;
}

// ---------- Secrets (server + host only) ----------

export interface FmSecretEntry {
  text: string | null;
  matched: number | null;
  points: number;
}

export interface Secrets {
  deck: string[];
  used: string[];
  current: Question | null;
  fm: {
    questions: Question[];
    entries: [FmSecretEntry[], FmSecretEntry[]];
  } | null;
  undo: { state: GameState; secrets: Omit<Secrets, 'undo'> } | null;
}

/** What the host device receives from the secrets endpoint. */
export interface HostSecrets {
  version: number;
  current: Question | null;
  fm: Secrets['fm'];
  canUndo: boolean;
}

// ---------- Actions ----------

export type Action =
  // lobby (host)
  | { type: 'setTeamName'; team: TeamId; name: string }
  | { type: 'assignPlayer'; playerId: string; team: TeamId | null }
  | { type: 'shuffleTeams' }
  | { type: 'updateSettings'; settings: Partial<Settings> }
  | { type: 'kickPlayer'; playerId: string }
  | { type: 'startGame' }
  // face-off
  | { type: 'repickFaceoff' }
  | { type: 'skipQuestion' }
  | { type: 'openBuzzers' }
  | { type: 'resetBuzzers' }
  | { type: 'buzz'; reactionMs: number }
  | { type: 'resolveBuzz'; force?: boolean }
  | { type: 'faceoffJudge'; correct: boolean; answerIndex?: number }
  | { type: 'playOrPass'; choice: 'play' | 'pass' }
  // round
  | { type: 'revealAnswer'; answerIndex: number }
  | { type: 'strike' }
  | { type: 'stealFail' }
  | { type: 'revealAll' }
  | { type: 'nextRound' }
  | { type: 'adjustScore'; team: TeamId; delta: number }
  | { type: 'undo' }
  // fast money
  | { type: 'startFastMoney' }
  | { type: 'fmSetPlayers'; players: [string, string] }
  | { type: 'fmStartTimer' }
  | { type: 'fmAnswer'; q: number; text: string }
  | { type: 'fmTimeUp' }
  | { type: 'fmJudge'; player: 0 | 1; q: number; answerIndex: number }
  | { type: 'fmDuplicate'; q: number }
  | { type: 'fmEndTurn' }
  | { type: 'fmRevealNext' }
  | { type: 'fmContinue' }
  // any time
  | { type: 'playAgain' }
  | { type: 'leave' }
  // server-internal
  | { type: 'addPlayer'; playerId: string; name: string };

export type Actor = { role: 'host' } | { role: 'player'; playerId: string } | { role: 'system' };
