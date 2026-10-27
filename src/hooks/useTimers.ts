import { useEffect, useRef, useState } from 'react';

/**
 * Local timestamp of when `key` last became non-null on this device. Timers run off the
 * local clock from the moment this device saw the change, so clock skew between devices
 * and the server doesn't matter.
 */
export function useLocalStart(key: string | number | null | undefined): number | null {
  const [start, setStart] = useState<number | null>(key == null ? null : performance.now());
  const prev = useRef(key);
  useEffect(() => {
    if (key === prev.current) return;
    prev.current = key;
    setStart(key == null ? null : performance.now());
  }, [key]);
  return start;
}

/** Re-renders every `interval` ms while `active`, returning performance.now(). */
export function useNow(active: boolean, interval = 100): number {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(performance.now()), interval);
    return () => clearInterval(id);
  }, [active, interval]);
  return now;
}

/** Seconds remaining (fractional) on a countdown that started at `start`. */
export function useCountdown(start: number | null, seconds: number, stopped = false) {
  const now = useNow(start !== null && !stopped, 100);
  if (start === null) return seconds;
  return Math.max(0, seconds - (now - start) / 1000);
}
