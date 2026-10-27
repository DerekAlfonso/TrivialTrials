import { animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { useEffect } from 'react';
import type { GameState, TeamId } from '../shared/types';

export function CountUp({ value, className }: { value: number; className?: string }) {
  const mv = useMotionValue(value);
  const rounded = useTransform(mv, (v) => Math.round(v).toLocaleString());
  useEffect(() => {
    const c = animate(mv, value, { duration: 1.1, ease: 'easeOut' });
    return () => c.stop();
  }, [value, mv]);
  return <motion.span className={className}>{rounded}</motion.span>;
}

export function TeamScore({
  state,
  team,
  size = 'md',
  active,
}: {
  state: GameState;
  team: TeamId;
  size?: 'sm' | 'md' | 'xl';
  active?: boolean;
}) {
  const t = state.teams[team];
  const cls = team === 'A' ? 'team-a' : 'team-b';
  const sizes = {
    sm: { box: 'px-3 py-1.5 rounded-xl', name: 'text-[10px]', score: 'text-2xl' },
    md: { box: 'px-4 py-2 rounded-2xl', name: 'text-xs', score: 'text-4xl' },
    xl: { box: 'px-[2.5vmin] py-[1.5vmin] rounded-[2vmin]', name: 'text-[2.4vmin]', score: 'text-[7.5vmin]' },
  }[size];
  return (
    <div
      className={`${cls} relative min-w-0 text-center transition ${sizes.box} ${active ? 'scale-105' : ''}`}
      style={{
        background: 'linear-gradient(180deg, color-mix(in srgb, var(--team) 35%, #0a1240), #070c2c)',
        border: '2px solid color-mix(in srgb, var(--team) 70%, transparent)',
        boxShadow: active ? '0 0 0 3px var(--color-gold), 0 0 30px color-mix(in srgb, var(--team) 60%, transparent)' : 'none',
      }}
    >
      <div className={`truncate font-extrabold uppercase tracking-wider ${sizes.name}`} style={{ color: 'var(--team)' }}>
        {t.name}
      </div>
      <CountUp value={t.score} className={`board-font block leading-none text-white ${sizes.score}`} />
    </div>
  );
}

export function Bank({ state, size = 'md' }: { state: GameState; size?: 'sm' | 'md' | 'xl' }) {
  const r = state.round;
  const cls = {
    sm: { box: 'px-3 py-1', value: 'text-2xl', label: 'text-[10px]' },
    md: { box: 'px-4 py-1.5', value: 'text-4xl', label: 'text-xs' },
    xl: { box: 'px-[3vmin] py-[1vmin]', value: 'text-[6.5vmin]', label: 'text-[2.2vmin]' },
  }[size];
  return (
    <div className={`board-frame !rounded-2xl !p-1 text-center`}>
      <div className={`board-inner !rounded-xl ${cls.box}`}>
        <div className={`font-extrabold uppercase tracking-widest text-gold-light ${cls.label}`}>
          {r?.suddenDeath ? 'Sudden death' : r ? `Round ${r.number}` : 'Bank'}
          {r && r.multiplier > 1 && <span className="ml-1 text-white">· x{r.multiplier}</span>}
        </div>
        <CountUp value={r?.bank ?? 0} className={`board-font block leading-none text-white ${cls.value}`} />
      </div>
    </div>
  );
}

export function Scoreboard({ state, size = 'md' }: { state: GameState; size?: 'sm' | 'md' | 'xl' }) {
  const control = state.round?.control ?? null;
  const steal = state.phase === 'STEAL';
  const active = (t: TeamId) =>
    (state.phase === 'ROUND_PLAY' && control === t) || (steal && control !== null && control !== t);
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
      <TeamScore state={state} team="A" size={size} active={active('A')} />
      <Bank state={state} size={size} />
      <TeamScore state={state} team="B" size={size} active={active('B')} />
    </div>
  );
}

export function Strikes({ count, size = 'md' }: { count: number; size?: 'sm' | 'md' | 'xl' }) {
  const cls = { sm: 'text-2xl', md: 'text-4xl', xl: 'text-[8vmin]' }[size];
  return (
    <div className="flex items-center justify-center gap-2" aria-label={`${count} strikes`}>
      {[0, 1, 2].map((i) => (
        <span key={i} className={`board-font ${cls} ${i < count ? 'strike-x !text-[#ff1f33]' : 'text-white/10'}`} style={i < count ? { WebkitTextStroke: '1.5px #ffd3d6' } : undefined}>
          ✕
        </span>
      ))}
    </div>
  );
}
