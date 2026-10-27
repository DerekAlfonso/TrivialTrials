import type { ReactNode } from 'react';
import { AnswerBoard } from '../../components/AnswerBoard';
import { Banner, playerName, Pop, TeamName } from '../../components/Common';
import { Buzzer } from '../../components/Buzzer';
import { Scoreboard, Strikes } from '../../components/Scoreboard';
import type { GameHandle } from '../../hooks/useGame';
import { otherTeam } from '../../shared/rules';
import type { GameState, TeamId } from '../../shared/types';
import { PlayerFastMoney } from './PlayerFastMoney';

export interface PlayerProps {
  g: GameHandle;
  state: GameState;
  meId: string;
}

export function PlayerView(props: PlayerProps) {
  const { state, meId } = props;
  const me = state.players.find((p) => p.id === meId);
  if (!me) return null;

  if (state.phase === 'LOBBY') return <Lobby {...props} />;
  if (!me.team) {
    return (
      <Center>
        <div className="text-6xl">⏳</div>
        <h2 className="font-display text-2xl">Hang tight, {me.name}!</h2>
        <p className="text-muted">The host will put you on a team between turns.</p>
      </Center>
    );
  }
  if (state.phase.startsWith('FM_')) return <PlayerFastMoney {...props} />;
  return <InGame {...props} team={me.team} />;
}

function Center({ children }: { children: ReactNode }) {
  return <div className="flex flex-1 flex-col items-center justify-center gap-4 py-8 text-center">{children}</div>;
}

function TeamBar({ state, team }: { state: GameState; team: TeamId }) {
  return (
    <div
      className={`${team === 'A' ? 'team-a' : 'team-b'} rounded-xl px-3 py-1.5 text-center text-sm font-bold uppercase tracking-wider`}
      style={{ background: 'color-mix(in srgb, var(--team) 22%, transparent)', color: 'var(--team)' }}
    >
      You’re on {state.teams[team].name}
    </div>
  );
}

function Lobby({ state, meId }: PlayerProps) {
  const me = state.players.find((p) => p.id === meId)!;
  const mates = me.team ? state.players.filter((p) => p.team === me.team) : [];
  return (
    <Center>
      <Pop k={me.team ?? 'none'} className="flex w-full max-w-sm flex-col items-center gap-4">
        <div className="text-6xl">{me.team ? '🎉' : '🙌'}</div>
        <h2 className="font-display text-3xl">You’re in, {me.name}!</h2>
        {me.team ? (
          <>
            <TeamBar state={state} team={me.team} />
            <div className="panel w-full p-4">
              <div className="mb-2 text-xs font-bold uppercase tracking-widest text-muted">Your team</div>
              <div className="flex flex-wrap justify-center gap-2">
                {mates.map((p) => (
                  <span key={p.id} className={`rounded-full px-3 py-1 font-semibold ${p.id === meId ? 'bg-gold text-[#2a1a00]' : 'bg-white/10'}`}>
                    {p.name}
                  </span>
                ))}
              </div>
            </div>
          </>
        ) : (
          <p className="text-muted">Waiting for the host to pick teams…</p>
        )}
        <p className="text-sm text-muted">The game starts when the host is ready. Keep this screen open!</p>
      </Pop>
    </Center>
  );
}

function InGame({ g, state, meId, team }: PlayerProps & { team: TeamId }) {
  const r = state.round;
  if (state.phase === 'GAME_OVER') {
    const won = state.winner === team;
    return (
      <Center>
        <div className="text-7xl">{won ? '🏆' : '👏'}</div>
        <Banner tone={state.winner!}>{state.teams[state.winner!].name} wins!</Banner>
        <Scoreboard state={state} size="sm" />
        <p className="text-muted">{won ? 'Stay tuned for Fast Money!' : 'Great game!'}</p>
      </Center>
    );
  }
  if (!r) return null;
  const f = r.faceoff;
  const myFaceoff = f.players[team] === meId;
  const inFaceoff = state.phase.startsWith('FACEOFF');

  return (
    <div className="flex flex-col gap-3">
      <TeamBar state={state} team={team} />
      <Scoreboard state={state} size="sm" />

      {inFaceoff && myFaceoff && (
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <h2 className="font-display text-2xl">
            {state.phase === 'FACEOFF_READY' && 'You’re in the face-off!'}
            {state.phase === 'FACEOFF_OPEN' && 'BUZZ IN!'}
            {state.phase === 'FACEOFF_JUDGING' && (f.order[f.attempt] === meId ? 'Say your answer!' : 'Hold on…')}
          </h2>
          {state.phase === 'FACEOFF_READY' && <p className="text-muted">Listen to the host. The buzzer lights up when it’s go time.</p>}
          <Buzzer
            key={`${r.question.id}-${f.players.A}-${f.players.B}-${f.openedAt}`}
            armed={state.phase === 'FACEOFF_OPEN'}
            buzzedMs={f.buzzes.find((b) => b.playerId === meId)?.reactionMs ?? null}
            onBuzz={(ms) => g.act({ type: 'buzz', reactionMs: ms })}
          />
          <BuzzResult state={state} meId={meId} />
        </div>
      )}

      {inFaceoff && !myFaceoff && (
        <Pop k={`${f.players.A}${f.players.B}`} className="panel flex flex-col items-center gap-2 p-5 text-center">
          <div className="text-xs font-bold uppercase tracking-widest text-muted">Face-off for your team</div>
          <div className="font-display text-4xl">{playerName(state, f.players[team])}</div>
          <div className="text-muted">
            vs <b className="text-white">{playerName(state, f.players[otherTeam(team)])}</b>
          </div>
          {state.phase === 'FACEOFF_OPEN' && <Banner tone="red">Buzzers are live!</Banner>}
          {state.phase === 'FACEOFF_JUDGING' && (
            <p className="font-semibold">{playerName(state, f.order[f.attempt])} is answering…</p>
          )}
        </Pop>
      )}

      {state.phase === 'PLAY_OR_PASS' && f.winner && (
        f.players[f.winner] === meId ? (
          <Pop k="pp" className="panel flex flex-col gap-3 p-5 text-center">
            <h2 className="font-display text-2xl">You won the face-off!</h2>
            <p className="text-muted">Play this round, or pass it to the other team?</p>
            <div className="grid grid-cols-2 gap-3">
              <button className="btn btn-green !min-h-20 text-2xl" onClick={() => g.act({ type: 'playOrPass', choice: 'play' })}>
                Play
              </button>
              <button className="btn btn-ghost !min-h-20 text-2xl" onClick={() => g.act({ type: 'playOrPass', choice: 'pass' })}>
                Pass
              </button>
            </div>
          </Pop>
        ) : (
          <Banner tone={f.winner}>
            {playerName(state, f.players[f.winner])} is deciding: play or pass?
          </Banner>
        )
      )}

      {state.phase === 'ROUND_PLAY' && r.control && (
        r.control === team ? (
          r.turnOrder[r.turn] === meId ? (
            <Pop k={`turn-${r.turn}-${r.strikes}`} className="rounded-2xl p-5 text-center" >
              <Banner tone="gold">🎤 Your turn! Give the host an answer</Banner>
            </Pop>
          ) : (
            <div className="panel p-3 text-center">
              Up now: <b className="font-display text-xl">{playerName(state, r.turnOrder[r.turn])}</b>
              <div className="text-xs text-muted">Help out quietly… no coaching!</div>
            </div>
          )
        ) : (
          <div className="panel p-3 text-center text-sm">
            <TeamName state={state} team={r.control} /> is playing. Think of answers for a steal!
          </div>
        )
      )}

      {state.phase === 'STEAL' && r.control && (
        r.control === team ? (
          <Banner tone={otherTeam(team)}>They’re trying to steal your points…</Banner>
        ) : (
          <Pop k="steal" className="flex flex-col gap-2 text-center">
            <Banner tone="red">Steal! Huddle up</Banner>
            <p className="font-semibold">
              {r.stealCaptain === meId ? 'You’re the captain. Give the host your team’s answer!' : `Captain ${playerName(state, r.stealCaptain)} gives the answer.`}
            </p>
          </Pop>
        )
      )}

      {state.phase === 'ROUND_END' && r.result?.team && (
        <Banner tone={r.result.team}>
          {state.teams[r.result.team].name} {r.result.stolen ? 'steals' : 'wins'} {r.result.points} points!
        </Banner>
      )}

      {!inFaceoff || !myFaceoff ? (
        <>
          <div className="panel p-3 text-center text-base font-bold">{r.question.text}</div>
          <AnswerBoard board={r.board} size="sm" />
          {(state.phase === 'ROUND_PLAY' || state.phase === 'STEAL') && <Strikes count={r.strikes} size="sm" />}
        </>
      ) : null}
    </div>
  );
}

function BuzzResult({ state, meId }: { state: GameState; meId: string }) {
  const f = state.round!.faceoff;
  const mine = f.buzzes.find((b) => b.playerId === meId);
  if (!mine) return null;
  const first = state.phase === 'FACEOFF_JUDGING' ? f.order[0] === meId : null;
  return (
    <div className="text-center">
      <div className="board-font text-4xl text-gold-light">{(mine.reactionMs / 1000).toFixed(2)}s</div>
      {first === true && <Banner tone="gold">You were first!</Banner>}
      {first === false && <p className="text-muted">{playerName(state, f.order[0])} was faster.</p>}
    </div>
  );
}
