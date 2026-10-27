import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { ConnectionDot, QR } from '../../components/Common';
import { DEFAULT_SETTINGS, MAX_TEAM_NAME_LENGTH } from '../../shared/rules';
import type { Player, Settings, TeamId } from '../../shared/types';
import type { HostProps } from './HostView';

const LENGTHS: { label: string; settings: Partial<Settings> }[] = [
  { label: 'Quick: 3 rounds (x1, x2, x3)', settings: { rounds: 3, multipliers: [1, 2, 3], targetScore: 0 } },
  { label: 'Classic: 4 rounds (x1, x1, x2, x3)', settings: { rounds: 4, multipliers: [1, 1, 2, 3], targetScore: 0 } },
  { label: 'Long: 6 rounds (x1 ×3, x2 ×2, x3)', settings: { rounds: 6, multipliers: [1, 1, 1, 2, 2, 3], targetScore: 0 } },
  { label: 'First to 300 points', settings: { targetScore: 300, multipliers: [1, 1, 2, 3], rounds: 4 } },
  { label: 'First to 500 points', settings: { targetScore: 500, multipliers: [1, 1, 2, 3], rounds: 4 } },
];

function lengthIndex(s: Settings) {
  const i = LENGTHS.findIndex(
    (l) =>
      (l.settings.targetScore ?? 0) === s.targetScore &&
      (s.targetScore > 0 || (l.settings.rounds === s.rounds && l.settings.multipliers!.join() === s.multipliers.join())),
  );
  return i < 0 ? 1 : i;
}

export function HostLobby({ g, state }: HostProps) {
  const origin = window.location.origin;
  const joinUrl = `${origin}/join/${state.code}`;
  const boardUrl = `${origin}/board/${state.code}`;
  const [showBoardQr, setShowBoardQr] = useState(false);
  const online = new Set(g.presence.map((p) => p.id));
  const boards = g.presence.filter((p) => p.role === 'board').length;
  const unassigned = state.players.filter((p) => !p.team);
  const counts = { A: state.players.filter((p) => p.team === 'A').length, B: state.players.filter((p) => p.team === 'B').length };
  const canStart = counts.A > 0 && counts.B > 0;
  const s = state.settings;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
      {/* Join info */}
      <section className="panel flex flex-col items-center gap-4 p-5 text-center">
        <div className="text-xs font-bold uppercase tracking-[0.3em] text-muted">Game code</div>
        <motion.div
          className="logo-text text-7xl tracking-[0.18em] sm:text-8xl"
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
        >
          {state.code}
        </motion.div>
        <QR text={showBoardQr ? boardUrl : joinUrl} size={170} />
        <div className="text-sm text-muted">
          {showBoardQr ? 'Scan on the TV/tablet, or open' : 'Scan to join, or go to'}{' '}
          <span className="font-semibold break-all text-white">{(showBoardQr ? boardUrl : joinUrl).replace(/^https?:\/\//, '')}</span>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <button className="btn btn-ghost !min-h-10 text-sm" onClick={() => setShowBoardQr((v) => !v)}>
            {showBoardQr ? '🙋 Show player QR' : '📺 Show board-display QR'}
          </button>
          <button
            className="btn btn-ghost !min-h-10 text-sm"
            onClick={() => {
              const url = showBoardQr ? boardUrl : joinUrl;
              if (navigator.share) navigator.share({ title: 'Join my game', url }).catch(() => undefined);
              else navigator.clipboard?.writeText(url);
            }}
          >
            🔗 Share link
          </button>
        </div>
        <div className="text-xs text-muted">
          {boards > 0 ? `📺 ${boards} board display${boards > 1 ? 's' : ''} connected` : 'No board display connected (optional)'}
        </div>
      </section>

      {/* Teams */}
      <section className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2">
          {(['A', 'B'] as TeamId[]).map((t) => (
            <TeamColumn key={t} team={t} {...{ g, state, online }} />
          ))}
        </div>

        <div className="panel p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted">Waiting for a team ({unassigned.length})</h3>
            <button className="btn btn-ghost !min-h-9 !py-1 text-sm" onClick={() => g.act({ type: 'shuffleTeams' })} disabled={state.players.length < 2}>
              🔀 Shuffle all
            </button>
          </div>
          {unassigned.length === 0 ? (
            <p className="text-sm text-muted">{state.players.length ? 'Everyone has a team.' : 'Players will appear here as they join…'}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {unassigned.map((p) => (
                <PlayerChip key={p.id} p={p} online={online.has(p.id)} g={g} />
              ))}
            </div>
          )}
        </div>

        <div className="panel grid gap-3 p-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs font-bold uppercase tracking-widest text-muted">Game length</span>
            <select
              className="input !min-h-11 !text-base"
              value={lengthIndex(s)}
              onChange={(e) => g.act({ type: 'updateSettings', settings: LENGTHS[Number(e.target.value)].settings })}
            >
              {LENGTHS.map((l, i) => (
                <option key={i} value={i}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
            <input
              type="checkbox"
              className="h-6 w-6 accent-[var(--color-gold)]"
              checked={s.fastMoney}
              onChange={(e) => g.act({ type: 'updateSettings', settings: { fastMoney: e.target.checked } })}
            />
            <span className="font-semibold">Fast Money finale</span>
          </label>
          <label className="flex items-center justify-between gap-2 rounded-xl bg-white/5 p-3 text-sm font-semibold">
            Fast Money clock
            <select
              className="rounded-lg bg-stage px-2 py-1"
              value={s.fmSeconds.join('/')}
              disabled={!s.fastMoney}
              onChange={(e) =>
                g.act({ type: 'updateSettings', settings: { fmSeconds: e.target.value.split('/').map(Number) as [number, number] } })
              }
            >
              {['20/25', '30/35', '45/50', '60/60'].map((v) => (
                <option key={v} value={v}>
                  {v.replace('/', 's / ')}s{v === DEFAULT_SETTINGS.fmSeconds.join('/') ? ' (classic)' : ''}
                </option>
              ))}
            </select>
          </label>
        </div>

        <button
          className="btn btn-gold !min-h-16 text-xl"
          disabled={!canStart || g.pending}
          onClick={() => g.act({ type: 'startGame' })}
        >
          {canStart ? '▶ Start the game' : 'Each team needs at least one player'}
        </button>
      </section>
    </div>
  );
}

function TeamColumn({ team, g, state, online }: { team: TeamId; online: Set<string> } & Pick<HostProps, 'g' | 'state'>) {
  const [name, setName] = useState(state.teams[team].name);
  useEffect(() => setName(state.teams[team].name), [state.teams, team]);
  const players = state.players.filter((p) => p.team === team);
  const commit = () => {
    const v = name.trim();
    if (v && v !== state.teams[team].name) g.act({ type: 'setTeamName', team, name: v });
    else setName(state.teams[team].name);
  };
  return (
    <div
      className={`${team === 'A' ? 'team-a' : 'team-b'} panel flex min-h-48 flex-col gap-2 p-3`}
      style={{ borderColor: 'color-mix(in srgb, var(--team) 55%, transparent)', borderWidth: 2 }}
    >
      <input
        className="w-full rounded-lg bg-transparent px-1 py-1 text-center font-display text-lg uppercase outline-none focus:bg-white/5"
        style={{ color: 'var(--team)' }}
        value={name}
        maxLength={MAX_TEAM_NAME_LENGTH}
        onChange={(e) => setName(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        aria-label={`Team ${team} name`}
      />
      <div className="text-center text-[10px] font-bold uppercase tracking-widest text-muted">tap name to rename</div>
      {players.map((p) => (
        <PlayerChip key={p.id} p={p} online={online.has(p.id)} g={g} />
      ))}
      {!players.length && <p className="py-4 text-center text-sm text-muted">No players yet</p>}
    </div>
  );
}

function PlayerChip({ p, online, g }: { p: Player; online: boolean; g: HostProps['g'] }) {
  const move = (team: TeamId | null) => g.act({ type: 'assignPlayer', playerId: p.id, team });
  return (
    <motion.div layout className="flex items-center gap-2 rounded-xl bg-white/8 px-2 py-1.5">
      <ConnectionDot connected={online} />
      <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
      {p.team !== 'A' && (
        <button className="team-a h-9 w-9 rounded-lg font-black text-white" style={{ background: 'var(--team)' }} onClick={() => move('A')} aria-label={`Move ${p.name} to team A`}>
          A
        </button>
      )}
      {p.team !== 'B' && (
        <button className="team-b h-9 w-9 rounded-lg font-black text-white" style={{ background: 'var(--team)' }} onClick={() => move('B')} aria-label={`Move ${p.name} to team B`}>
          B
        </button>
      )}
      <button
        className="h-9 w-9 rounded-lg bg-white/10 text-muted hover:bg-red/70 hover:text-white"
        onClick={() => confirm(`Remove ${p.name} from the game?`) && g.act({ type: 'kickPlayer', playerId: p.id })}
        aria-label={`Remove ${p.name}`}
      >
        ✕
      </button>
    </motion.div>
  );
}
