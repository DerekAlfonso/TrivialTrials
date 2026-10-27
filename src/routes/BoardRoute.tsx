import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AnswerBoard } from '../components/AnswerBoard';
import { Banner, playerName, QR } from '../components/Common';
import { Logo } from '../components/Logo';
import { Scoreboard, Strikes } from '../components/Scoreboard';
import { StrikeOverlay } from '../components/StrikeOverlay';
import { useGame } from '../hooks/useGame';
import { useGameEffects } from '../hooks/useGameEffects';
import { useCountdown, useLocalStart } from '../hooks/useTimers';
import type { Identity } from '../lib/identity';
import { fullscreenSupported, isFullscreen, keepAwake, toggleFullscreen } from '../lib/screen';
import { isAudioLocked, unlockAudio } from '../lib/sound';
import { normalizeCode, otherTeam } from '../shared/rules';
import type { GameState, TeamId } from '../shared/types';
import { FastMoneyBoard } from '../screens/player/PlayerFastMoney';

/** Read-only room display for a TV, laptop or tablet. */
export function BoardRoute() {
  const code = normalizeCode(useParams().code ?? '');
  const identity = useMemo<Identity>(() => {
    let id = '';
    try {
      id = sessionStorage.getItem('tt:board') ?? '';
      if (!id) sessionStorage.setItem('tt:board', (id = `board-${Math.random().toString(36).slice(2, 10)}`));
    } catch {
      id = `board-${Math.random().toString(36).slice(2, 10)}`;
    }
    return { code, role: 'board', playerId: id, token: '' };
  }, [code]);
  const g = useGame(identity);
  const flash = useGameEffects(g.state, 'board');
  const [fs, setFs] = useState(isFullscreen());
  const [idle, setIdle] = useState(false);
  const [soundLocked, setSoundLocked] = useState(isAudioLocked());

  useEffect(() => keepAwake(), []);
  useEffect(() => {
    const onFs = () => setFs(isFullscreen());
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('webkitfullscreenchange', onFs);
    const onKey = (e: KeyboardEvent) => e.key.toLowerCase() === 'f' && toggleFullscreen();
    window.addEventListener('keydown', onKey);
    // Hide the cursor and controls after a few idle seconds.
    let t: ReturnType<typeof setTimeout>;
    const wake = () => {
      setIdle(false);
      clearTimeout(t);
      t = setTimeout(() => setIdle(true), 3000);
    };
    wake();
    window.addEventListener('pointermove', wake);
    window.addEventListener('pointerdown', wake);
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      document.removeEventListener('webkitfullscreenchange', onFs);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointermove', wake);
      window.removeEventListener('pointerdown', wake);
      clearTimeout(t);
    };
  }, []);

  const enableSound = () => {
    unlockAudio();
    setTimeout(() => setSoundLocked(isAudioLocked()), 100);
  };

  if (g.gone) {
    return (
      <div className="stage grid place-items-center text-center">
        <div className="panel flex flex-col gap-4 p-8">
          <p className="text-2xl font-semibold">{g.gone}</p>
          <Link className="btn btn-gold" to="/tv">
            Enter another code
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`stage flex h-dvh flex-col overflow-hidden ${idle && fs ? 'hide-cursor' : ''}`}
      onDoubleClick={() => toggleFullscreen()}
      onPointerDown={soundLocked ? enableSound : undefined}
    >
      <div className="flex min-h-0 flex-1 flex-col px-[3vw] py-[2.5vh]">
        {g.state ? <BoardScreen state={g.state} /> : <Logo size="xl" />}
      </div>

      <AnimatePresence>
        {(!idle || !fs) && (
          <motion.div
            className="fixed top-3 right-3 z-30 flex gap-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {soundLocked && (
              <button className="btn btn-ghost bg-stage/80" onClick={enableSound}>
                🔊 Tap to enable sound
              </button>
            )}
            {fullscreenSupported() && (
              <button className="btn btn-gold" onClick={() => toggleFullscreen()}>
                {fs ? '⤡ Exit full screen' : '⤢ Go full screen'}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <StrikeOverlay event={flash} />
    </div>
  );
}

function Title({ children }: { children: ReactNode }) {
  return (
    <motion.div
      key={String(children)}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="text-center text-[4.4vh] leading-tight font-extrabold text-white drop-shadow-lg"
    >
      {children}
    </motion.div>
  );
}

function TeamChip({ state, team, name }: { state: GameState; team: TeamId; name: string }) {
  return (
    <div
      className={`${team === 'A' ? 'team-a' : 'team-b'} rounded-[2vh] px-[3vh] py-[1.5vh] text-center`}
      style={{ background: 'color-mix(in srgb, var(--team) 30%, #070c2c)', border: '3px solid var(--team)' }}
    >
      <div className="font-display text-[5vh] leading-none">{name}</div>
      <div className="mt-[0.6vh] text-[2.2vh] font-bold uppercase tracking-widest" style={{ color: 'var(--team)' }}>
        {state.teams[team].name}
      </div>
    </div>
  );
}

function BoardScreen({ state }: { state: GameState }) {
  const origin = window.location.origin;

  if (state.phase === 'LOBBY') {
    return (
      <div className="grid h-full grid-cols-[1fr_1.1fr] items-center gap-[4vw]">
        <div className="flex flex-col items-center gap-[3vh]">
          <Logo size="xl" />
          <div className="text-[3vh] font-semibold text-muted">Join on your phone at</div>
          <div className="text-[4vh] font-bold">{origin.replace(/^https?:\/\//, '')}</div>
          <div className="logo-text text-[16vh] leading-none tracking-[0.15em]">{state.code}</div>
          <QR text={`${origin}/join/${state.code}`} size={Math.round(window.innerHeight * 0.22)} />
        </div>
        <div className="grid grid-cols-2 gap-[2vw]">
          {(['A', 'B'] as TeamId[]).map((t) => (
            <div
              key={t}
              className={`${t === 'A' ? 'team-a' : 'team-b'} panel min-h-[50vh] p-[2.5vh]`}
              style={{ borderColor: 'var(--team)', borderWidth: 3 }}
            >
              <div className="mb-[2vh] text-center font-display text-[4.5vh]" style={{ color: 'var(--team)' }}>
                {state.teams[t].name}
              </div>
              <div className="flex flex-col gap-[1.2vh]">
                <AnimatePresence>
                  {state.players
                    .filter((p) => p.team === t)
                    .map((p) => (
                      <motion.div
                        key={p.id}
                        layout
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0 }}
                        className="rounded-[1.5vh] bg-white/10 px-[2vh] py-[1vh] text-[3.2vh] font-bold"
                      >
                        {p.name}
                      </motion.div>
                    ))}
                </AnimatePresence>
              </div>
            </div>
          ))}
          {state.players.some((p) => !p.team) && (
            <div className="col-span-2 text-center text-[2.6vh] text-muted">
              Waiting for a team: {state.players.filter((p) => !p.team).map((p) => p.name).join(', ')}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (state.phase.startsWith('FM_')) return <BoardFastMoney state={state} />;

  if (state.phase === 'GAME_OVER') {
    const w = state.winner!;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-[4vh]">
        <motion.div initial={{ scale: 0.3, rotate: -10 }} animate={{ scale: 1, rotate: 0 }} className="text-[20vh] leading-none">
          🏆
        </motion.div>
        <div className="w-[60vw] text-[6vh]">
          <Banner tone={w}>{state.teams[w].name} wins!</Banner>
        </div>
        <div className="w-[70vw]">
          <Scoreboard state={state} size="xl" />
        </div>
        {state.settings.fastMoney && <div className="font-display text-[4vh] text-gold-light">Fast Money is next…</div>}
      </div>
    );
  }

  const r = state.round;
  if (!r) return null;
  const f = r.faceoff;
  const phase = state.phase;

  let title: ReactNode = r.question.text;
  let sub: ReactNode = null;
  if (phase === 'FACEOFF_READY' || phase === 'FACEOFF_OPEN' || phase === 'FACEOFF_JUDGING') {
    title = phase === 'FACEOFF_READY' ? 'Face-off!' : r.question.text;
    sub = (
      <div className="flex items-center justify-center gap-[3vw]">
        <TeamChip state={state} team="A" name={playerName(state, f.players.A)} />
        <div className="font-display text-[6vh] text-gold">VS</div>
        <TeamChip state={state} team="B" name={playerName(state, f.players.B)} />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-[2vh]">
      <Scoreboard state={state} size="xl" />
      <Title>{title}</Title>
      {sub}
      {phase === 'FACEOFF_OPEN' && (
        <div className="text-center">
          {f.buzzes.length ? (
            <BuzzFlash state={state} />
          ) : (
            <motion.div animate={{ scale: [1, 1.06, 1] }} transition={{ repeat: Infinity, duration: 0.9 }} className="font-display text-[5vh] text-red">
              Buzzers are live!
            </motion.div>
          )}
        </div>
      )}
      {phase === 'FACEOFF_JUDGING' && (
        <div className="text-center text-[3.6vh]">
          <BuzzFlash state={state} />
        </div>
      )}
      {phase === 'PLAY_OR_PASS' && f.winner && (
        <div className="mx-auto text-[4.5vh]">
          <Banner tone={f.winner}>{state.teams[f.winner].name}: play or pass?</Banner>
        </div>
      )}
      {phase === 'STEAL' && r.control && (
        <motion.div initial={{ scale: 0.5 }} animate={{ scale: 1 }} className="mx-auto text-[5vh]">
          <Banner tone="red">
            {state.teams[otherTeam(r.control)].name} can steal! Captain: {playerName(state, r.stealCaptain)}
          </Banner>
        </motion.div>
      )}
      {phase === 'ROUND_END' && r.result?.team && (
        <motion.div initial={{ scale: 0.5 }} animate={{ scale: 1 }} className="mx-auto text-[5vh]">
          <Banner tone={r.result.team}>
            {state.teams[r.result.team].name} {r.result.stolen ? 'steals' : 'wins'} {r.result.points} points!
          </Banner>
        </motion.div>
      )}

      <div className="mx-auto flex min-h-0 w-full max-w-[150vh] flex-1 flex-col justify-center">
        <AnswerBoard board={r.board} size="xl" />
      </div>
      {(phase === 'ROUND_PLAY' || phase === 'STEAL') && (
        <div className="flex items-center justify-center gap-[3vw]">
          {phase === 'ROUND_PLAY' && r.control && (
            <div className="text-[3.2vh] font-semibold text-muted">
              Up now: <b className="font-display text-white">{playerName(state, r.turnOrder[r.turn])}</b>
            </div>
          )}
          <Strikes count={r.strikes} size="xl" />
        </div>
      )}
    </div>
  );
}

function BuzzFlash({ state }: { state: GameState }) {
  const f = state.round!.faceoff;
  const first = state.phase === 'FACEOFF_JUDGING' ? f.order[f.attempt] : [...f.buzzes].sort((a, b) => a.reactionMs - b.reactionMs)[0]?.playerId;
  const buzz = f.buzzes.find((b) => b.playerId === first);
  return (
    <motion.div key={first} initial={{ scale: 1.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="font-display text-[5vh]">
      🔴 {playerName(state, first)}
      {buzz && <span className="ml-[1vw] text-[3.5vh] text-gold-light">{(buzz.reactionMs / 1000).toFixed(2)}s</span>}
      {state.phase === 'FACEOFF_JUDGING' && <span className="ml-[1vw] text-[3vh] text-muted">is answering…</span>}
    </motion.div>
  );
}

function BoardFastMoney({ state }: { state: GameState }) {
  const fm = state.fastMoney;
  const p = fm?.current ?? 0;
  const seconds = state.settings.fmSeconds[p];
  const playing = state.phase === 'FM_P1' || state.phase === 'FM_P2';
  const start = useLocalStart(playing ? fm?.timerStartedAt : null);
  const remaining = useCountdown(start, seconds, !!fm?.timeUp);

  if (state.phase === 'FM_SETUP' || !fm) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-[4vh]">
        <Logo size="xl" />
        <div className="w-[60vw] text-[7vh]">
          <Banner tone="gold">⚡ Fast Money ⚡</Banner>
        </div>
        <div className="text-[3.5vh] text-muted">{state.teams[state.winner!].name} is choosing two players…</div>
      </div>
    );
  }
  if (state.phase === 'FM_END') {
    const total = fm.totals[0] + fm.totals[1];
    return (
      <div className="flex h-full flex-col items-center justify-center gap-[3vh]">
        <motion.div initial={{ scale: 0.3 }} animate={{ scale: 1 }} className="text-[18vh] leading-none">
          {fm.won ? '💰' : '😅'}
        </motion.div>
        <div className="w-[60vw] text-[6vh]">
          <Banner tone={fm.won ? 'gold' : 'red'}>{fm.won ? 'Fast Money winners!' : 'So close!'}</Banner>
        </div>
        <div className="board-font text-[16vh] leading-none text-gold-light glow-text">{total}</div>
        <div className="w-[80vw]">
          <FastMoneyBoard state={state} size="xl" />
        </div>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col gap-[2vh]">
      <div className="flex items-center justify-between">
        <div className="font-display text-[5vh] text-gold">⚡ Fast Money</div>
        <div className="text-center">
          <div className="text-[2.4vh] font-bold uppercase tracking-widest text-muted">Player {p + 1}</div>
          <div className="font-display text-[5vh]">{playerName(state, fm.players[p])}</div>
        </div>
        <div className="text-right">
          <div className="text-[2.4vh] font-bold uppercase tracking-widest text-muted">Target</div>
          <div className="board-font text-[6vh] leading-none">{state.settings.fmTarget}</div>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 items-center gap-[3vw]">
        <div className="min-w-0 flex-1">
          <FastMoneyBoard state={state} size="xl" />
        </div>
        {playing && (
          <div className="board-frame grid h-[28vh] w-[28vh] shrink-0 place-items-center !rounded-full">
            <div
              className={`board-inner board-font grid h-full w-full place-items-center !rounded-full text-[14vh] ${remaining <= 5 && fm.timerStartedAt ? 'text-red' : 'text-white'}`}
            >
              {fm.timerStartedAt ? Math.ceil(remaining) : seconds}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
