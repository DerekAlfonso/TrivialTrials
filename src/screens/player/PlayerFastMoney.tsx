import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Banner, CountdownRing, playerName, Pop } from '../../components/Common';
import { useCountdown, useLocalStart } from '../../hooks/useTimers';
import { play, vibrate } from '../../lib/sound';
import { FM_QUESTIONS } from '../../shared/rules';
import type { GameState } from '../../shared/types';
import type { PlayerProps } from './PlayerView';

export function PlayerFastMoney(props: PlayerProps) {
  const { state, meId } = props;
  const fm = state.fastMoney;
  if (state.phase === 'FM_SETUP' || !fm) {
    return (
      <Center>
        <Banner tone="gold">⚡ Fast Money ⚡</Banner>
        <p className="text-muted">The host is choosing two players from {state.teams[state.winner!].name}…</p>
      </Center>
    );
  }
  const myIndex = fm.players.indexOf(meId);
  const answering = (state.phase === 'FM_P1' && fm.players[0] === meId) || (state.phase === 'FM_P2' && fm.players[1] === meId);
  if (answering) return <Answering {...props} />;

  // Player two waits "offstage" while player one plays and is revealed.
  const offstage = fm.players[1] === meId && fm.players[0] !== meId && (state.phase === 'FM_P1' || state.phase === 'FM_P1_REVEAL');
  if (offstage) {
    return (
      <Center>
        <div className="text-7xl">🙈</div>
        <h2 className="font-display text-2xl">You’re up second!</h2>
        <p className="max-w-xs text-muted">
          No peeking or listening while {playerName(state, fm.players[0])} plays. Step out of the room or cover your ears. Your turn is next!
        </p>
      </Center>
    );
  }
  return <Watch state={state} meId={meId} myIndex={myIndex} />;
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 flex-col items-center justify-center gap-4 py-8 text-center">{children}</div>;
}

function Answering({ g, state }: PlayerProps) {
  const fm = state.fastMoney!;
  const p = fm.current;
  const total = state.settings.fmSeconds[p];
  const start = useLocalStart(fm.timerStartedAt);
  const remaining = useCountdown(start, total, fm.timeUp);
  const entries = fm.entries[p];
  const [q, setQ] = useState(0);
  const [text, setText] = useState('');
  const [mine, setMine] = useState<string[]>(Array(FM_QUESTIONS).fill(''));
  const [dupNotice, setDupNotice] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const running = fm.timerStartedAt !== null && !fm.timeUp && remaining > 0;
  const allDone = entries.every((e) => e.answered);

  // Time's up on this device: tell the server once.
  const reported = useRef<number | null>(null);
  useEffect(() => {
    if (start !== null && remaining <= 0 && !fm.timeUp && reported.current !== start) {
      reported.current = start;
      play('timeUp');
      vibrate([200, 100, 200]);
      g.act({ type: 'fmTimeUp' });
    }
  }, [remaining, start, fm.timeUp, g]);

  // The host flagged a duplicate: jump back to that question.
  const { seq, type: evType, data: evData } = state.event;
  useEffect(() => {
    if (evType === 'fmDuplicate') {
      const dq = Number(evData?.q);
      setDupNotice(dq);
      setQ(dq);
      setMine((m) => m.map((v, i) => (i === dq ? '' : v)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq]);

  useEffect(() => {
    if (running) input.current?.focus();
  }, [running, q]);

  const nextOpen = (from: number) => {
    for (let k = 1; k <= FM_QUESTIONS; k++) {
      const i = (from + k) % FM_QUESTIONS;
      if (!entries[i].answered && i !== from) return i;
    }
    return from;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const v = text.trim();
    if (!v || !running || entries[q].answered) return;
    setText('');
    setMine((m) => m.map((x, i) => (i === q ? v : x)));
    setDupNotice(null);
    const cur = q;
    setQ(nextOpen(cur));
    const ok = await g.act({ type: 'fmAnswer', q: cur, text: v });
    if (!ok) setMine((m) => m.map((x, i) => (i === cur ? '' : x)));
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <Banner tone="gold">⚡ Fast Money ⚡</Banner>
      <CountdownRing remaining={fm.timerStartedAt ? remaining : total} total={total} size={130} />
      {fm.timerStartedAt === null && <p className="font-semibold text-muted">Get ready! The host will start your clock.</p>}
      {fm.timeUp && <Banner tone="red">Time’s up!</Banner>}

      {!allDone && !fm.timeUp && (
        <Pop k={q} className="panel w-full max-w-md p-4">
          <div className="mb-1 text-xs font-bold uppercase tracking-widest text-gold-light">
            Question {q + 1} of {FM_QUESTIONS}
          </div>
          <p className="mb-3 text-xl font-bold">{fm.questions[q].text}</p>
          {dupNotice === q && <p className="mb-2 font-bold text-red">Duplicate answer! Try something else.</p>}
          <form onSubmit={submit} className="flex gap-2">
            <input
              ref={input}
              className="input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={running ? 'Type your answer' : 'Waiting for the clock…'}
              disabled={!running || entries[q].answered}
              autoComplete="off"
              autoCorrect="off"
              enterKeyHint="next"
              maxLength={40}
            />
            <button className="btn btn-gold" disabled={!running || !text.trim()}>
              ✓
            </button>
          </form>
          <button
            type="button"
            className="btn btn-ghost mt-2 w-full text-sm"
            disabled={!running}
            onClick={() => {
              setText('');
              setQ(nextOpen(q));
            }}
          >
            Pass, come back to it ⤼
          </button>
        </Pop>
      )}

      <div className="grid w-full max-w-md gap-1.5">
        {fm.questions.map((question, i) => (
          <button
            key={question.id}
            type="button"
            onClick={() => !entries[i].answered && running && setQ(i)}
            className={`flex items-center gap-2 rounded-xl px-3 py-2 text-left ${i === q && !allDone ? 'bg-gold/20 ring-2 ring-gold' : 'bg-white/5'}`}
          >
            <span className="board-font w-5 text-lg text-gold-light">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate text-sm text-muted">{question.text}</span>
            <span className="max-w-[40%] truncate font-bold">{entries[i].answered ? mine[i] || '✓' : ''}</span>
          </button>
        ))}
      </div>
      {allDone && <p className="font-semibold text-muted">All answered! Waiting for the host…</p>}
    </div>
  );
}

function Watch({ state, meId, myIndex }: { state: GameState; meId: string; myIndex: number }) {
  const fm = state.fastMoney!;
  const total = fm.totals[0] + fm.totals[1];
  const me = state.players.find((p) => p.id === meId);
  const onTeam = me?.team === state.winner;
  return (
    <div className="flex flex-col gap-3">
      <Banner tone="gold">⚡ Fast Money ⚡</Banner>
      {state.phase === 'FM_END' ? (
        <Center>
          <div className="text-7xl">{fm.won ? '💰' : '😅'}</div>
          <h2 className="font-display text-3xl">{fm.won ? 'They did it!' : 'So close!'}</h2>
          <div className="board-font text-6xl text-gold-light">{total}</div>
          {myIndex >= 0 && <p className="text-muted">You scored {fm.totals[myIndex]}.</p>}
        </Center>
      ) : (
        <>
          <p className="text-center text-muted">
            {state.phase === 'FM_P1' || state.phase === 'FM_P2'
              ? `${playerName(state, fm.players[fm.current])} is answering…`
              : 'Revealing answers…'}{' '}
            {onTeam && 'Cheer them on!'}
          </p>
          <FastMoneyBoard state={state} size="sm" />
        </>
      )}
    </div>
  );
}

export function FastMoneyBoard({ state, size = 'sm' }: { state: GameState; size?: 'sm' | 'xl' }) {
  const fm = state.fastMoney!;
  const total = fm.totals[0] + fm.totals[1];
  const big = size === 'xl';
  const cell = big ? 'h-[8.5vh] text-[4vh]' : 'h-10 text-base';
  const pts = big ? 'w-[11vh] text-[5vh]' : 'w-12 text-xl';
  const coverP1 = state.phase === 'FM_P2';
  return (
    <div className="board-frame">
      <div className={`board-inner grid grid-cols-2 ${big ? 'gap-[2vh] p-[2vh]' : 'gap-2'}`}>
        {[0, 1].map((p) => (
          <div key={p} className={`flex flex-col ${big ? 'gap-[1.2vh]' : 'gap-1.5'}`}>
            {fm.entries[p].map((e, i) => (
              <div key={i} className={`flex items-stretch overflow-hidden rounded-lg border-2 border-board-light/50 bg-board-dark ${cell}`}>
                <span className="board-font flex min-w-0 flex-1 items-center truncate px-2 uppercase">
                  {coverP1 && p === 0 ? '' : (e.text ?? '')}
                </span>
                <span className={`board-font grid place-items-center border-l-2 border-gold-light/60 bg-board ${pts}`}>
                  {e.points ?? ''}
                </span>
              </div>
            ))}
          </div>
        ))}
        <div className={`col-span-2 flex items-center justify-end gap-3 ${big ? 'pt-[1vh]' : ''}`}>
          <span className={`font-display uppercase text-gold-light ${big ? 'text-[3.5vh]' : 'text-sm'}`}>Total</span>
          <span className={`board-font rounded-lg bg-board-dark px-3 ${big ? 'text-[7vh]' : 'text-3xl'} ${total >= state.settings.fmTarget ? 'text-gold-light glow-text' : ''}`}>
            {total}
          </span>
        </div>
      </div>
    </div>
  );
}
