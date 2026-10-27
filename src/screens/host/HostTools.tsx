import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { ConnectionDot } from '../../components/Common';
import type { TeamId } from '../../shared/types';
import type { HostProps } from './HostView';

/** Floating host toolbox: undo, score fixes, player management, and ending the game. */
export function HostTools({ g, state }: HostProps) {
  const [open, setOpen] = useState(false);
  const online = new Set(g.presence.map((p) => p.id));
  const canUndo = !!g.secrets?.canUndo;

  return (
    <>
      <div className="fixed right-3 bottom-[calc(0.75rem+var(--safe-bottom))] z-30 flex gap-2">
        <button
          className="btn btn-ghost !min-h-12 bg-stage/90 backdrop-blur"
          onClick={() => g.act({ type: 'undo' })}
          disabled={!canUndo || g.pending}
          title="Undo last judgment"
        >
          ↶ Undo
        </button>
        <button className="btn btn-ghost !min-h-12 bg-stage/90 backdrop-blur" onClick={() => setOpen(true)} aria-label="Host tools">
          ⚙️
        </button>
      </div>
      <div className="h-16" />
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 sm:items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
          >
            <motion.div
              className="panel max-h-[85dvh] w-full max-w-lg overflow-y-auto !rounded-b-none p-5 pb-[calc(1.25rem+var(--safe-bottom))] sm:!rounded-b-[1.25rem]"
              initial={{ y: 60 }}
              animate={{ y: 0 }}
              exit={{ y: 60 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-xl text-gold">Host tools</h2>
                <button className="btn btn-ghost !min-h-10" onClick={() => setOpen(false)}>
                  Close
                </button>
              </div>

              <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted">Adjust scores</h3>
              <div className="mb-5 grid grid-cols-2 gap-3">
                {(['A', 'B'] as TeamId[]).map((t) => (
                  <div key={t} className={`${t === 'A' ? 'team-a' : 'team-b'} rounded-xl bg-white/5 p-3 text-center`}>
                    <div className="truncate text-sm font-bold" style={{ color: 'var(--team)' }}>
                      {state.teams[t].name}
                    </div>
                    <div className="board-font text-3xl">{state.teams[t].score}</div>
                    <div className="mt-2 grid grid-cols-4 gap-1">
                      {[-10, -1, 1, 10].map((d) => (
                        <button key={d} className="rounded-lg bg-white/10 py-2 text-sm font-bold" onClick={() => g.act({ type: 'adjustScore', team: t, delta: d })}>
                          {d > 0 ? `+${d}` : d}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted">Players</h3>
              <p className="mb-2 text-xs text-muted">New arrivals land in “No team”. Moves take effect from the next turn.</p>
              <div className="mb-5 flex flex-col gap-1.5">
                {state.players.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 rounded-xl bg-white/5 px-2 py-1.5">
                    <ConnectionDot connected={online.has(p.id)} />
                    <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
                    <select
                      className="rounded-lg bg-stage px-2 py-1.5 text-sm"
                      value={p.team ?? ''}
                      onChange={(e) => g.act({ type: 'assignPlayer', playerId: p.id, team: (e.target.value || null) as TeamId | null })}
                    >
                      <option value="">No team</option>
                      <option value="A">{state.teams.A.name}</option>
                      <option value="B">{state.teams.B.name}</option>
                    </select>
                    <button
                      className="h-9 w-9 rounded-lg bg-white/10 text-muted hover:bg-red/70 hover:text-white"
                      onClick={() => confirm(`Remove ${p.name}?`) && g.act({ type: 'kickPlayer', playerId: p.id })}
                      aria-label={`Remove ${p.name}`}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              <button
                className="btn btn-ghost w-full text-red"
                onClick={() => {
                  if (confirm('End this game and return everyone to the lobby? Scores will reset.')) {
                    g.act({ type: 'playAgain' });
                    setOpen(false);
                  }
                }}
              >
                ⏹ End game & return to lobby
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
