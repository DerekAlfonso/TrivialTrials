import { motion } from 'framer-motion';
import QRCode from 'qrcode';
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { isMuted, onMuteChange, setMuted, unlockAudio } from '../lib/sound';
import type { GameState, TeamId } from '../shared/types';

export function QR({ text, size = 200 }: { text: string; size?: number }) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    QRCode.toDataURL(text, { margin: 1, width: size * 2, color: { dark: '#061f5c', light: '#ffffff' } })
      .then(setSrc)
      .catch(() => setSrc(undefined));
  }, [text, size]);
  return (
    <div className="rounded-2xl bg-white p-2 shadow-xl" style={{ width: size + 16, height: size + 16 }}>
      {src && <img src={src} alt={`QR code for ${text}`} width={size} height={size} />}
    </div>
  );
}

export function MuteButton({ className = '' }: { className?: string }) {
  const muted = useSyncExternalStore(onMuteChange, isMuted);
  return (
    <button
      type="button"
      className={`btn btn-ghost !min-h-10 !px-3 !py-2 text-lg ${className}`}
      onClick={() => {
        unlockAudio();
        setMuted(!muted);
      }}
      aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
      title={muted ? 'Unmute' : 'Mute'}
    >
      {muted ? '🔇' : '🔊'}
    </button>
  );
}

export function ConnectionDot({ connected }: { connected: boolean }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${connected ? 'bg-ok shadow-[0_0_8px_#22c55e]' : 'animate-pulse bg-red'}`}
      title={connected ? 'Connected' : 'Reconnecting…'}
      aria-label={connected ? 'Connected' : 'Reconnecting'}
    />
  );
}

export function TeamName({ state, team, className = '' }: { state: GameState; team: TeamId; className?: string }) {
  return (
    <span className={`font-extrabold ${className}`} style={{ color: team === 'A' ? 'var(--color-team-a)' : 'var(--color-team-b)' }}>
      {state.teams[team].name}
    </span>
  );
}

export function playerName(state: GameState, id: string | null | undefined) {
  return state.players.find((p) => p.id === id)?.name ?? 'Someone';
}

export function Pop({ children, k, className = '' }: { children: ReactNode; k: string | number; className?: string }) {
  return (
    <motion.div
      key={k}
      className={className}
      initial={{ opacity: 0, y: 14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
    >
      {children}
    </motion.div>
  );
}

export function Banner({
  children,
  tone = 'gold',
  inherit = false,
}: {
  children: ReactNode;
  tone?: 'gold' | 'red' | 'blue' | TeamId;
  /** Take the font size from the parent (board display). */
  inherit?: boolean;
}) {
  const bg = {
    gold: 'linear-gradient(180deg,#ffe58a,#f7c843 60%,#d99a12)',
    red: 'linear-gradient(180deg,#ff5b67,#e3172b 60%,#a50d1c)',
    blue: 'linear-gradient(180deg,#4d8dff,#1a64e0 60%,#0b3a9e)',
    A: 'linear-gradient(180deg,#ff8a6b,#ff5a36 60%,#c2361a)',
    B: 'linear-gradient(180deg,#7cc8ff,#2fa8ff 60%,#1673c2)',
  }[tone];
  const dark = tone === 'gold';
  return (
    <div
      className={`rounded-2xl px-[0.8em] py-[0.5em] text-center font-display uppercase shadow-xl ${inherit ? 'text-[1em]' : 'text-xl'} ${dark ? 'text-[#2a1a00]' : 'text-white'}`}
      style={{ background: bg, textShadow: dark ? 'none' : '0 2px 0 rgba(0,0,0,.3)' }}
    >
      {children}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-muted">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-gold/30 border-t-gold" />
      {label && <div className="text-sm font-semibold">{label}</div>}
    </div>
  );
}

export function CountdownRing({ remaining, total, size = 120 }: { remaining: number; total: number; size?: number }) {
  const r = size / 2 - 8;
  const c = 2 * Math.PI * r;
  const frac = total > 0 ? remaining / total : 0;
  const urgent = remaining <= 5;
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,.12)" strokeWidth="10" fill="rgba(4,12,50,.8)" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={urgent ? '#e3172b' : '#f7c843'}
          strokeWidth="10"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          style={{ transition: 'stroke-dashoffset .1s linear' }}
        />
      </svg>
      <span
        className={`board-font absolute leading-none ${urgent ? 'text-red' : 'text-white'}`}
        style={{ fontSize: size * 0.42 }}
      >
        {Math.ceil(remaining)}
      </span>
    </div>
  );
}
