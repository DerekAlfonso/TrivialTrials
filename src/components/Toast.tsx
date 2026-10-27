import { AnimatePresence, motion } from 'framer-motion';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

type ToastFn = (message: string) => void;
const ToastContext = createContext<ToastFn>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<{ id: number; message: string }[]>([]);
  const next = useRef(0);
  const toast = useCallback((message: string) => {
    const id = ++next.current;
    setToasts((t) => [...t.filter((x) => x.message !== message), { id, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);
  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 pb-[calc(1rem+var(--safe-bottom))]">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10 }}
              role="status"
              className="max-w-md rounded-xl border border-white/15 bg-black/85 px-4 py-3 text-center text-sm font-semibold shadow-2xl"
            >
              {t.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
