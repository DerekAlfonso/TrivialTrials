import { AnimatePresence, motion } from 'framer-motion';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { useToast } from '../components/Toast';
import { APP_TAGLINE } from '../config';
import { api } from '../lib/api';
import { getLastGame, saveIdentity } from '../lib/identity';
import { CODE_LENGTH, MAX_NAME_LENGTH, normalizeCode } from '../shared/rules';

type Mode = 'menu' | 'join' | 'board';

export function Home({ mode: initialMode = 'menu' }: { mode?: Mode }) {
  const params = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [code, setCode] = useState(normalizeCode(params.code ?? ''));
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem('tt:name') ?? '';
    } catch {
      return '';
    }
  });
  const [busy, setBusy] = useState(false);
  const last = getLastGame();

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const host = () =>
    run(async () => {
      const id = await api.create();
      saveIdentity(id);
      navigate(`/play/${id.code}`);
    });

  const join = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      const id = await api.join(code, name);
      try {
        localStorage.setItem('tt:name', name.trim());
      } catch {
        /* ignore */
      }
      saveIdentity(id);
      navigate(`/play/${id.code}`);
    });
  };

  const board = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      await api.state(code); // confirm it exists before switching screens
      navigate(`/board/${normalizeCode(code)}`);
    });
  };

  const rejoin = () =>
    run(async () => {
      if (!last) return;
      if (last.role === 'host') {
        saveIdentity(last);
        navigate(`/play/${last.code}`);
        return;
      }
      const id = await api.join(last.code, '', { playerId: last.playerId, token: last.token });
      saveIdentity(id);
      navigate(`/play/${id.code}`);
    });

  return (
    <div className="stage flex flex-col items-center px-4">
      <div className="flex w-full max-w-md flex-1 flex-col justify-center gap-8 py-10">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 160, damping: 14 }}>
          <div className="bulbs mx-auto mb-4 h-2 w-48 rounded-full opacity-80" />
          <Logo size="lg" />
          <p className="mt-4 text-center font-semibold text-muted">{APP_TAGLINE}</p>
        </motion.div>

        <AnimatePresence mode="wait">
          {mode === 'menu' && (
            <Card key="menu">
              <button className="btn btn-gold w-full !min-h-16 text-xl" onClick={host} disabled={busy}>
                🎤 Host a game
              </button>
              <button className="btn btn-blue w-full !min-h-16 text-xl" onClick={() => setMode('join')}>
                🙋 Join a game
              </button>
              <button className="btn btn-ghost w-full" onClick={() => setMode('board')}>
                📺 Show the board on a TV
              </button>
              {last && (
                <button className="btn btn-ghost w-full text-sm" onClick={rejoin} disabled={busy}>
                  ↩ Rejoin game {last.code} {last.role === 'host' ? '(as host)' : ''}
                </button>
              )}
            </Card>
          )}

          {mode === 'join' && (
            <Card key="join">
              <form onSubmit={join} className="flex flex-col gap-4">
                <Field label="Game code">
                  <input
                    className="input code-input"
                    value={code}
                    onChange={(e) => setCode(normalizeCode(e.target.value))}
                    placeholder="ABCD"
                    autoCapitalize="characters"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    inputMode="text"
                    maxLength={CODE_LENGTH}
                    autoFocus={!code}
                  />
                </Field>
                <Field label="Your name">
                  <input
                    className="input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Jordan"
                    maxLength={MAX_NAME_LENGTH}
                    autoComplete="nickname"
                    autoFocus={!!code}
                  />
                </Field>
                <button className="btn btn-gold !min-h-14 text-lg" disabled={busy || code.length !== CODE_LENGTH || !name.trim()}>
                  Let’s play!
                </button>
                <BackLink onClick={() => setMode('menu')} />
              </form>
            </Card>
          )}

          {mode === 'board' && (
            <Card key="board">
              <form onSubmit={board} className="flex flex-col gap-4">
                <p className="text-sm text-muted">
                  Turn this screen into the game board for the room. It’s read-only and shows every reveal, strike
                  and score. Best on a TV, laptop or tablet in landscape.
                </p>
                <Field label="Game code">
                  <input
                    className="input code-input"
                    value={code}
                    onChange={(e) => setCode(normalizeCode(e.target.value))}
                    placeholder="ABCD"
                    autoCapitalize="characters"
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={CODE_LENGTH}
                    autoFocus
                  />
                </Field>
                <button className="btn btn-gold !min-h-14 text-lg" disabled={busy || code.length !== CODE_LENGTH}>
                  Show the board
                </button>
                <BackLink onClick={() => setMode('menu')} />
              </form>
            </Card>
          )}
        </AnimatePresence>
      </div>
      <footer className="pb-4 text-center text-xs text-muted/70">
        Gather 3+ people: one host and at least one player per team.
      </footer>
    </div>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
    <motion.div
      className="panel flex flex-col gap-3 p-5"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
    >
      {children}
    </motion.div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-bold uppercase tracking-widest text-muted">{label}</span>
      {children}
    </label>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="text-sm font-semibold text-muted underline-offset-4 hover:underline" onClick={onClick}>
      ← Back
    </button>
  );
}
