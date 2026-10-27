import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import type { GameEvent } from '../shared/types';

/** Full-screen red ✕ flash for strikes, missed face-off answers and failed steals. */
export function StrikeOverlay({ event }: { event: GameEvent | null }) {
  const [shown, setShown] = useState<GameEvent | null>(null);
  useEffect(() => {
    if (!event) return;
    setShown(event);
    const t = setTimeout(() => setShown(null), 1300);
    return () => clearTimeout(t);
  }, [event]);

  const count = shown?.type === 'strike' ? Number(shown.data?.count ?? 1) : 1;
  return (
    <AnimatePresence>
      {shown && (
        <motion.div
          key={shown.seq}
          className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center gap-[3vw] bg-black/45"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {Array.from({ length: count }, (_, i) => (
            <motion.span
              key={i}
              className="strike-x text-[34vmin]"
              initial={{ scale: 2.4, opacity: 0, rotate: -12 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 18, delay: i * 0.06 }}
            >
              ✕
            </motion.span>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
