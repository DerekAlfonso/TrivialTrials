import { useEffect, useMemo } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ConnectionDot, MuteButton, Spinner } from '../components/Common';
import { LogoInline } from '../components/Logo';
import { StrikeOverlay } from '../components/StrikeOverlay';
import { useGame } from '../hooks/useGame';
import { useGameEffects } from '../hooks/useGameEffects';
import { clearIdentity, getIdentity } from '../lib/identity';
import { keepAwake } from '../lib/screen';
import { normalizeCode } from '../shared/rules';
import { HostView } from '../screens/host/HostView';
import { PlayerView } from '../screens/player/PlayerView';

export function GameRoute() {
  const code = normalizeCode(useParams().code ?? '');
  const identity = useMemo(() => getIdentity(code), [code]);
  const g = useGame(identity);
  const flash = useGameEffects(g.state, identity?.role ?? 'player', identity?.playerId);

  useEffect(() => keepAwake(), []);

  if (!identity) return <Navigate to={`/join/${code}`} replace />;

  if (g.gone) {
    return (
      <div className="stage grid place-items-center px-6 text-center">
        <div className="panel flex max-w-sm flex-col gap-4 p-6">
          <div className="text-5xl">👋</div>
          <p className="text-lg font-semibold">{g.gone}</p>
          <Link className="btn btn-gold" to="/" onClick={() => clearIdentity(code)}>
            Back to start
          </Link>
        </div>
      </div>
    );
  }

  const me = g.state?.players.find((p) => p.id === identity.playerId);
  return (
    <div className="stage flex flex-col">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-white/5 bg-stage/70 px-3 py-2 backdrop-blur-md">
        <Link to="/" aria-label="Home" className="shrink-0">
          <LogoInline />
        </Link>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-3 text-sm">
          <span className={`truncate font-semibold text-muted ${identity.role === 'host' ? 'hidden sm:inline' : ''}`}>
            {identity.role === 'host' ? 'Host' : me?.name}
          </span>
          <span className="board-font rounded-lg bg-white/10 px-2 py-0.5 text-lg tracking-widest text-gold-light">{code}</span>
          <ConnectionDot connected={g.connected} />
          <MuteButton />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-3 py-3 sm:px-5">
        {!g.state ? (
          <Spinner label="Connecting to the game…" />
        ) : identity.role === 'host' ? (
          <HostView g={g} state={g.state} identity={identity} />
        ) : (
          <PlayerView g={g} state={g.state} meId={identity.playerId} />
        )}
      </main>
      <StrikeOverlay event={flash} />
    </div>
  );
}
