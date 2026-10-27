import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnswerBoard } from '../../components/AnswerBoard';
import { Banner, playerName, Pop, TeamName } from '../../components/Common';
import { Scoreboard, Strikes } from '../../components/Scoreboard';
import { useLocalStart, useNow } from '../../hooks/useTimers';
import { otherTeam } from '../../shared/rules';
import type { HostProps } from './HostView';

const secs = (ms: number) => `${(ms / 1000).toFixed(2)}s`;

export function HostRound({ g, state }: HostProps) {
  const navigate = useNavigate();
  const r = state.round;
  const answers = g.secrets?.current && g.secrets.current.id === r?.question.id ? g.secrets.current.answers : undefined;
  const [picking, setPicking] = useState(false);
  useEffect(() => setPicking(false), [state.phase, r?.faceoff.attempt]);

  // Auto-resolve the face-off once the grace window after the first buzz has passed.
  const act = g.act;
  const firstBuzz = state.phase === 'FACEOFF_OPEN' ? (r?.faceoff.buzzes[0]?.playerId ?? null) : null;
  useEffect(() => {
    if (!firstBuzz) return;
    const t = setTimeout(() => act({ type: 'resolveBuzz' }), state.settings.buzzGraceMs + 150);
    return () => clearTimeout(t);
  }, [firstBuzz, state.settings.buzzGraceMs, act]);

  if (state.phase === 'GAME_OVER') {
    const w = state.winner!;
    return (
      <div className="flex flex-col gap-4">
        <Scoreboard state={state} />
        <Pop k="over" className="panel flex flex-col items-center gap-4 p-6 text-center">
          <div className="text-6xl">🏆</div>
          <Banner tone={w}>{state.teams[w].name} wins!</Banner>
          <p className="text-muted">
            Final score {state.teams.A.score} – {state.teams.B.score}
          </p>
          <div className="flex w-full max-w-md flex-col gap-3">
            {state.settings.fastMoney && (
              <button className="btn btn-gold !min-h-14 text-lg" onClick={() => g.act({ type: 'startFastMoney' })}>
                ⚡ Play Fast Money
              </button>
            )}
            <button className="btn btn-blue" onClick={() => g.act({ type: 'playAgain' })}>
              🔁 Play again with these teams
            </button>
            <button className="btn btn-ghost" onClick={() => navigate('/')}>
              New game
            </button>
          </div>
        </Pop>
      </div>
    );
  }
  if (!r) return null;

  const f = r.faceoff;
  const phase = state.phase;
  const tilePick = (i: number) => {
    if (phase === 'FACEOFF_JUDGING') g.act({ type: 'faceoffJudge', correct: true, answerIndex: i });
    else g.act({ type: 'revealAnswer', answerIndex: i });
  };
  const canPick =
    phase === 'FACEOFF_JUDGING' || phase === 'ROUND_PLAY' || phase === 'STEAL' || phase === 'ROUND_END';

  return (
    <div className="flex flex-col gap-3">
      <Scoreboard state={state} size="sm" />
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section className="flex flex-col gap-3">
          <div className="panel p-4">
            <div className="mb-1 text-[11px] font-bold uppercase tracking-widest text-gold-light">
              {r.suddenDeath ? 'Sudden death' : `Round ${r.number}`} · read aloud
            </div>
            <p className="text-xl font-bold leading-snug sm:text-2xl">{r.question.text}</p>
          </div>
          <div className={picking ? 'rounded-[1.6rem] ring-4 ring-ok/70 ring-offset-2 ring-offset-stage' : ''}>
            <AnswerBoard
              board={r.board}
              answers={answers}
              onPick={canPick ? tilePick : undefined}
              size="md"
            />
          </div>
          {canPick && (
            <p className="text-center text-xs text-muted">
              Tap an answer on the board to {phase === 'ROUND_END' ? 'reveal it (no points)' : 'mark it correct and reveal it'}.
            </p>
          )}
        </section>

        <section className="panel flex flex-col gap-3 p-4 lg:sticky lg:top-16 lg:self-start">
          {phase === 'FACEOFF_READY' && (
            <>
              <div className="text-xs font-bold uppercase tracking-widest text-muted">Face-off</div>
              <FaceoffNames state={state} />
              {state.event.type === 'faceoffWrong' && (
                <Banner tone="red">Both missed! New pair</Banner>
              )}
              <button className="btn btn-red !min-h-20 text-2xl" onClick={() => g.act({ type: 'openBuzzers' })} disabled={g.pending}>
                🔴 Open Buzzers
              </button>
              <p className="text-center text-xs text-muted">Tap as you start reading the question.</p>
              <div className="grid grid-cols-2 gap-2">
                <button className="btn btn-ghost text-sm" onClick={() => g.act({ type: 'repickFaceoff' })}>
                  🎲 New players
                </button>
                <button className="btn btn-ghost text-sm" onClick={() => g.act({ type: 'skipQuestion' })}>
                  ⏭ Skip question
                </button>
              </div>
            </>
          )}

          {phase === 'FACEOFF_OPEN' && <BuzzersOpen {...{ g, state }} />}

          {phase === 'FACEOFF_JUDGING' && (
            <>
              <div className="text-xs font-bold uppercase tracking-widest text-muted">
                {f.attempt === 0 ? 'First to buzz' : 'Their chance to answer'}
              </div>
              <Pop k={f.attempt} className="text-center">
                <div className="font-display text-3xl">{playerName(state, f.order[f.attempt])}</div>
                <BuzzTimes state={state} />
              </Pop>
              {picking ? (
                <Banner tone="gold">Tap the matching answer on the board</Banner>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <button className="btn btn-green !min-h-16 text-xl" onClick={() => setPicking(true)}>
                    ✓ Correct
                  </button>
                  <button className="btn btn-red !min-h-16 text-xl" onClick={() => g.act({ type: 'faceoffJudge', correct: false })}>
                    ✕ Wrong
                  </button>
                </div>
              )}
              {picking && (
                <button className="btn btn-ghost text-sm" onClick={() => setPicking(false)}>
                  Cancel
                </button>
              )}
              <button className="btn btn-ghost text-sm" onClick={() => g.act({ type: 'resetBuzzers' })}>
                ↺ Redo buzz-in
              </button>
            </>
          )}

          {phase === 'PLAY_OR_PASS' && f.winner && (
            <>
              <Banner tone={f.winner}>{state.teams[f.winner].name} won the face-off</Banner>
              <p className="text-center text-muted">
                Waiting for <b className="text-white">{playerName(state, f.players[f.winner])}</b> to choose…
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button className="btn btn-blue" onClick={() => g.act({ type: 'playOrPass', choice: 'play' })}>
                  Play
                </button>
                <button className="btn btn-ghost" onClick={() => g.act({ type: 'playOrPass', choice: 'pass' })}>
                  Pass
                </button>
              </div>
            </>
          )}

          {phase === 'ROUND_PLAY' && r.control && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm">
                  <TeamName state={state} team={r.control} /> in control
                </span>
                <Strikes count={r.strikes} size="sm" />
              </div>
              <Pop k={r.turn} className="rounded-xl bg-white/5 p-3 text-center">
                <div className="text-xs font-bold uppercase tracking-widest text-muted">Up now</div>
                <div className="font-display text-3xl">{playerName(state, r.turnOrder[r.turn])}</div>
                {r.turnOrder.length > 1 && (
                  <div className="text-xs text-muted">Next: {playerName(state, r.turnOrder[(r.turn + 1) % r.turnOrder.length])}</div>
                )}
              </Pop>
              <button className="btn btn-red !min-h-20 text-3xl" onClick={() => g.act({ type: 'strike' })} disabled={g.pending}>
                ✕ Strike
              </button>
              <p className="text-center text-xs text-muted">Right answer? Tap it on the board.</p>
            </>
          )}

          {phase === 'STEAL' && r.control && (
            <>
              <Banner tone={otherTeam(r.control)}>{state.teams[otherTeam(r.control)].name} can steal!</Banner>
              <p className="text-center">
                Captain <b className="font-display text-xl">{playerName(state, r.stealCaptain)}</b> gives the team’s answer.
              </p>
              <p className="text-center text-sm text-muted">
                Bank: <b className="text-white">{r.bank * r.multiplier}</b> points. Tap the matching answer if they get it.
              </p>
              <button className="btn btn-red !min-h-16 text-xl" onClick={() => g.act({ type: 'stealFail' })}>
                ✕ No match
              </button>
            </>
          )}

          {phase === 'ROUND_END' && r.result && (
            <>
              {r.result.team ? (
                <Banner tone={r.result.team}>
                  {state.teams[r.result.team].name} {r.result.stolen ? 'steals' : 'wins'} {r.result.points}!
                </Banner>
              ) : (
                <Banner>Round over</Banner>
              )}
              <button
                className="btn btn-ghost"
                onClick={() => g.act({ type: 'revealAll' })}
                disabled={r.board.every((b) => b.revealed)}
              >
                👀 Reveal remaining answers
              </button>
              <button className="btn btn-gold !min-h-16 text-xl" onClick={() => g.act({ type: 'nextRound' })} disabled={g.pending}>
                {isLastRound(state) ? '🏁 Finish game' : 'Next round ▶'}
              </button>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function isLastRound(state: HostProps['state']) {
  const s = state.settings;
  const a = state.teams.A.score;
  const b = state.teams.B.score;
  if (a === b) return false;
  if (state.round?.suddenDeath) return true;
  if (s.targetScore > 0) return Math.max(a, b) >= s.targetScore;
  return state.roundNumber >= s.rounds;
}

function FaceoffNames({ state }: { state: HostProps['state'] }) {
  const f = state.round!.faceoff;
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center">
      <div className="team-a min-w-0 rounded-xl p-2" style={{ background: 'color-mix(in srgb, var(--team) 25%, transparent)' }}>
        <div className="truncate font-display text-lg">{playerName(state, f.players.A)}</div>
        <div className="truncate text-[10px] font-bold uppercase text-team-a">{state.teams.A.name}</div>
      </div>
      <div className="font-display text-gold">VS</div>
      <div className="team-b min-w-0 rounded-xl p-2" style={{ background: 'color-mix(in srgb, var(--team) 25%, transparent)' }}>
        <div className="truncate font-display text-lg">{playerName(state, f.players.B)}</div>
        <div className="truncate text-[10px] font-bold uppercase text-team-b">{state.teams.B.name}</div>
      </div>
    </div>
  );
}

function BuzzTimes({ state }: { state: HostProps['state'] }) {
  const f = state.round!.faceoff;
  return (
    <div className="mt-1 flex justify-center gap-4 text-sm text-muted">
      {[...f.buzzes]
        .sort((a, b) => a.reactionMs - b.reactionMs)
        .map((b) => (
          <span key={b.playerId}>
            {playerName(state, b.playerId)}: <b className="text-white">{secs(b.reactionMs)}</b>
          </span>
        ))}
      {f.buzzes.length < 2 && <span>(other player didn’t buzz)</span>}
    </div>
  );
}

function BuzzersOpen({ g, state }: Pick<HostProps, 'g' | 'state'>) {
  const f = state.round!.faceoff;
  const start = useLocalStart(f.openedAt);
  const now = useNow(true, 50);
  return (
    <>
      <div className="text-xs font-bold uppercase tracking-widest text-muted">Buzzers are live</div>
      <FaceoffNames state={state} />
      <div className="board-font text-center text-6xl text-gold-light glow-text">{start ? ((now - start) / 1000).toFixed(1) : '0.0'}s</div>
      {f.buzzes.length > 0 ? (
        <Banner tone="red">
          {playerName(state, f.buzzes[0].playerId)} buzzed! ({secs(f.buzzes[0].reactionMs)})
        </Banner>
      ) : (
        <p className="text-center text-muted">Waiting for a buzz…</p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button className="btn btn-ghost text-sm" onClick={() => g.act({ type: 'resetBuzzers' })}>
          ↺ Reset
        </button>
        <button
          className="btn btn-ghost text-sm"
          disabled={!f.buzzes.length}
          onClick={() => g.act({ type: 'resolveBuzz', force: true })}
        >
          Lock in now
        </button>
      </div>
    </>
  );
}
