import { useEffect, useRef, useState } from 'react';
import { play, unlockAudio, vibrate } from '../lib/sound';

/**
 * The big red buzzer. When it lights up it starts a local stopwatch; the press reports the
 * elapsed milliseconds, so network lag on either device doesn't decide who was faster.
 */
export function Buzzer({ armed, onBuzz, buzzedMs }: { armed: boolean; onBuzz: (ms: number) => void; buzzedMs: number | null }) {
  const litAt = useRef<number | null>(null);
  const [pressed, setPressed] = useState(false);

  useEffect(() => {
    if (!armed) {
      litAt.current = null;
      setPressed(false);
      return;
    }
    // Start timing once the lit buzzer has actually been painted.
    const raf = requestAnimationFrame(() => {
      litAt.current = performance.now();
      vibrate(40);
    });
    return () => cancelAnimationFrame(raf);
  }, [armed]);

  const press = (e: React.PointerEvent) => {
    e.preventDefault();
    unlockAudio();
    if (!armed || pressed || buzzedMs !== null || litAt.current === null) return;
    const ms = performance.now() - litAt.current;
    setPressed(true);
    play('buzz');
    vibrate(120);
    onBuzz(ms);
  };

  const done = pressed || buzzedMs !== null;
  return (
    <button
      type="button"
      onPointerDown={press}
      onContextMenu={(e) => e.preventDefault()}
      className={`buzzer ${armed && !done ? 'armed' : ''} ${!armed ? 'disabled' : ''} ${done ? 'pressed' : ''}`}
      aria-label={armed ? 'Buzz in' : 'Buzzer not active yet'}
      aria-disabled={!armed || done}
    >
      <span className="buzzer-cap text-[clamp(1.6rem,9vw,3rem)]">{done ? '✓' : armed ? 'BUZZ!' : 'WAIT'}</span>
    </button>
  );
}
