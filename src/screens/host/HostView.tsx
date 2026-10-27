import type { GameHandle } from '../../hooks/useGame';
import type { Identity } from '../../lib/identity';
import type { GameState } from '../../shared/types';
import { HostFastMoney } from './HostFastMoney';
import { HostLobby } from './HostLobby';
import { HostRound } from './HostRound';
import { HostTools } from './HostTools';

export interface HostProps {
  g: GameHandle;
  state: GameState;
  identity: Identity;
}

export function HostView(props: HostProps) {
  const { state } = props;
  if (state.phase === 'LOBBY') return <HostLobby {...props} />;
  return (
    <>
      <HostTools {...props} />
      {state.phase.startsWith('FM_') ? <HostFastMoney {...props} /> : <HostRound {...props} />}
    </>
  );
}
