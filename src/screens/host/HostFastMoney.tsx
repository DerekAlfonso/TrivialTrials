import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Banner, CountdownRing, playerName, Pop } from '../../components/Common';
import { useCountdown, useLocalStart } from '../../hooks/useTimers';
import { suggestMatches } from '../../shared/match';
import { FM_QUESTIONS } from '../../shared/rules';
import type { FmSecretEntry, Question } from '../../shared/types';
import type { HostProps } from './HostView';

export function HostFastMoney(props: HostProps) {
  const { state } = props;
  if (state.phase === 'FM_SETUP') return <Setup {...props} />;
  if (state.phase === 'FM_END') return <End {...props} />;
  return <Play {...props} />;
}

function Setup({ g, state }: HostProps) {
  const team = state.winner!;
  const roster = state.players.filter((p) => p.team === team);
  const [picked, setPicked] = useState<string[]>([]);
  const solo = roster.length === 1;
  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 2 ? [p[1], id] : [...p, id]));
  const random = () => setPicked([...roster].sort(() => Math.random() - 0.5).slice(0, 2).map((p) => p.id));
  const players: [string, string] | null = solo ? [roster[0].id, roster[0].id] : picked.length === 2 ? [picked[0], picked[1]] : null;

  return (
    <Pop k="setup" className="mx-auto flex w-full max-w-lg flex-col gap-4">
      <Banner tone="gold">⚡ Fast Money ⚡</Banner>
      <div className="panel flex flex-col gap-3 p-5">
        <p className="text-muted">
          Pick two players from <b style={{ color: team === 'A' ? 'var(--color-team-a)' : 'var(--color-team-b)' }}>{state.teams[team].name}</b>.
          Each answers {FM_QUESTIONS} quick questions on their phone. Together they need{' '}
          <b className="text-white">{state.settings.fmTarget}</b> points.
        </p>
        {solo ? (
          <p className="rounded-xl bg-white/5 p-3">{roster[0].name} will play both halves.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {roster.map((p) => {
              const i = picked.indexOf(p.id);
              return (
                <button
                  key={p.id}
                  className={`btn justify-between ${i >= 0 ? 'btn-blue' : 'btn-ghost'}`}
                  onClick={() => toggle(p.id)}
                >
                  <span>{p.name}</span>
                  <span className="text-sm">{i === 0 ? 'Goes first' : i === 1 ? 'Goes second' : ''}</span>
                </button>
              );
            })}
            <button className="btn btn-ghost text-sm" onClick={random}>
              🎲 Pick randomly
            </button>
          </div>
        )}
        <button className="btn btn-gold !min-h-14 text-lg" disabled={!players} onClick={() => players && g.act({ type: 'fmSetPlayers', players })}>
          Start Fast Money
        </button>
      </div>
    </Pop>
  );
}

function Play({ g, state }: HostProps) {
  const fm = state.fastMoney!;
  const sec = g.secrets?.fm;
  const p = fm.current;
  const reveal = state.phase === 'FM_P1_REVEAL' || state.phase === 'FM_P2_REVEAL';
  const seconds = state.settings.fmSeconds[p];
  const start = useLocalStart(fm.timerStartedAt);
  const remaining = useCountdown(start, seconds, fm.timeUp || reveal);
  const runningTotal = (sec?.entries[0] ?? []).reduce((s, e) => s + e.points, 0) + (p === 1 ? (sec?.entries[1] ?? []).reduce((s, e) => s + e.points, 0) : 0);
  const unjudged = fm.entries[p].some((e) => e.answered && !e.judged);
  const nextStep = fm.revealStep;
  const allRevealed = nextStep >= FM_QUESTIONS * 2;

  return (
    <div className="flex flex-col gap-3">
      <div className="panel flex items-center gap-4 p-4">
        <CountdownRing remaining={fm.timerStartedAt ? remaining : seconds} total={seconds} size={84} />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-bold uppercase tracking-widest text-gold-light">
            Fast Money · Player {p + 1} {reveal ? '· reveal' : ''}
          </div>
          <div className="truncate font-display text-2xl">{playerName(state, fm.players[p])}</div>
          <div className="text-sm text-muted">
            Points so far (host only): <b className="text-white">{runningTotal}</b> / {state.settings.fmTarget}
          </div>
        </div>
      </div>

      {!reveal && (
        <div className="grid grid-cols-2 gap-2">
          <button
            className="btn btn-gold !min-h-14"
            disabled={fm.timerStartedAt !== null && !fm.timeUp}
            onClick={() => g.act({ type: 'fmStartTimer' })}
          >
            {fm.timerStartedAt === null ? '⏱ Start the clock' : fm.timeUp ? '⏱ Restart clock' : 'Clock running…'}
          </button>
          <button className="btn btn-blue !min-h-14" disabled={unjudged} onClick={() => g.act({ type: 'fmEndTurn' })}>
            {unjudged ? 'Judge all answers' : 'Done → Reveal'}
          </button>
        </div>
      )}
      {!reveal && p === 1 && (
        <p className="text-center text-xs text-muted">Player 1’s answers are shown for duplicate checks. Hit “Duplicate” if they repeat one.</p>
      )}

      {reveal && (
        <div className="grid grid-cols-2 gap-2">
          <button className="btn btn-gold !min-h-16 text-lg" disabled={allRevealed} onClick={() => g.act({ type: 'fmRevealNext' })}>
            {allRevealed ? 'All revealed' : nextStep % 2 === 0 ? `Show answer ${Math.floor(nextStep / 2) + 1}` : `Show points ${Math.floor(nextStep / 2) + 1}`}
          </button>
          <button className="btn btn-blue !min-h-16 text-lg" onClick={() => g.act({ type: 'fmContinue' })}>
            {state.phase === 'FM_P1_REVEAL' ? 'Bring out player 2 ▶' : 'Final result ▶'}
          </button>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {fm.questions.map((q, i) => (
          <JudgeRow
            key={q.id}
            index={i}
            question={sec?.questions[i]}
            entry={sec?.entries[p][i]}
            p1Entry={p === 1 ? sec?.entries[0][i] : undefined}
            answered={fm.entries[p][i].answered}
            judged={fm.entries[p][i].judged}
            revealedText={fm.entries[p][i].text !== null}
            revealedPoints={fm.entries[p][i].points !== null}
            canDuplicate={state.phase === 'FM_P2'}
            onJudge={(answerIndex) => g.act({ type: 'fmJudge', player: p, q: i, answerIndex })}
            onDuplicate={() => g.act({ type: 'fmDuplicate', q: i })}
            text={q.text}
          />
        ))}
      </div>
    </div>
  );
}

function JudgeRow(props: {
  index: number;
  text: string;
  question?: Question;
  entry?: FmSecretEntry;
  p1Entry?: FmSecretEntry;
  answered: boolean;
  judged: boolean;
  revealedText: boolean;
  revealedPoints: boolean;
  canDuplicate: boolean;
  onJudge(answerIndex: number): void;
  onDuplicate(): void;
}) {
  const { question, entry, answered, judged } = props;
  const suggestions = entry?.text && question ? suggestMatches(entry.text, question.answers, 0.45) : [];
  const best = suggestions[0]?.index;
  const ordered = question
    ? [...question.answers.keys()].sort((a, b) => {
        const sa = suggestions.find((s) => s.index === a)?.score ?? 0;
        const sb = suggestions.find((s) => s.index === b)?.score ?? 0;
        return sb - sa || a - b;
      })
    : [];

  return (
    <div className={`panel p-3 ${answered && !judged ? 'ring-2 ring-gold' : ''}`}>
      <div className="flex items-start gap-3">
        <span className="board-font grid h-8 w-8 shrink-0 place-items-center rounded-full bg-board-light text-lg">{props.index + 1}</span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-muted">{props.text}</div>
          {props.p1Entry && (
            <div className="text-xs text-muted">
              Player 1 said: <b className="text-white">{props.p1Entry.text ?? '—'}</b>
            </div>
          )}
          <div className="mt-1 flex items-center gap-2">
            <span className={`text-xl font-extrabold ${answered ? 'text-white' : 'text-white/30'}`}>
              {answered ? `“${entry?.text ?? '…'}”` : 'waiting…'}
            </span>
            {judged && answered && (
              <span className={`board-font rounded-md px-2 text-lg ${entry && entry.points > 0 ? 'bg-ok/80' : 'bg-red/80'}`}>{entry?.points ?? 0}</span>
            )}
            {props.revealedText && <span className="text-xs text-gold-light">{props.revealedPoints ? '● shown' : '◐ answer shown'}</span>}
          </div>
        </div>
      </div>
      {answered && question && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {ordered.map((i) => {
            const a = question.answers[i];
            const chosen = judged && entry?.matched === i;
            return (
              <button
                key={i}
                onClick={() => props.onJudge(i)}
                className={`rounded-lg px-2.5 py-1.5 text-sm font-semibold transition ${
                  chosen ? 'bg-ok text-white' : i === best && !judged ? 'bg-gold text-[#2a1a00]' : 'bg-white/10 hover:bg-white/20'
                }`}
              >
                {a.text} <span className="board-font opacity-70">{a.count}</span>
              </button>
            );
          })}
          <button
            onClick={() => props.onJudge(-1)}
            className={`rounded-lg px-2.5 py-1.5 text-sm font-bold ${judged && entry?.matched === null ? 'bg-red text-white' : 'bg-white/10 hover:bg-red/60'}`}
          >
            ✕ No match (0)
          </button>
          {props.canDuplicate && (
            <button onClick={props.onDuplicate} className="rounded-lg bg-white/10 px-2.5 py-1.5 text-sm font-bold hover:bg-red/60">
              🔁 Duplicate — try again
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function End({ g, state }: HostProps) {
  const navigate = useNavigate();
  const fm = state.fastMoney!;
  const total = fm.totals[0] + fm.totals[1];
  return (
    <Pop k="end" className="mx-auto flex w-full max-w-lg flex-col items-center gap-4 text-center">
      <div className="text-7xl">{fm.won ? '💰' : '😅'}</div>
      <Banner tone={fm.won ? 'gold' : 'red'}>{fm.won ? 'Fast Money winners!' : 'So close!'}</Banner>
      <div className="board-font text-7xl text-gold-light glow-text">{total}</div>
      <p className="text-muted">
        {playerName(state, fm.players[0])} {fm.totals[0]} + {playerName(state, fm.players[1])} {fm.totals[1]} (needed{' '}
        {state.settings.fmTarget})
      </p>
      <div className="flex w-full flex-col gap-3">
        <button className="btn btn-gold !min-h-14" onClick={() => g.act({ type: 'playAgain' })}>
          🔁 Play again with these teams
        </button>
        <button className="btn btn-ghost" onClick={() => navigate('/')}>
          New game
        </button>
      </div>
    </Pop>
  );
}
