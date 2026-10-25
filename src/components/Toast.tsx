import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

type ToastFn = (message: string) => void;
const ToastContext = createContext<ToastFn>(() => undefined);

/** Petit message vert citron en bas de l'écran (« Tâche ajoutée »…). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const show = useCallback<ToastFn>((m) => {
    setMessage(m);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), 2000);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div aria-live="polite" role="status" className="sr-only">
        {message}
      </div>
      {message && (
        <div className="toast" aria-hidden="true">
          {message}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastFn {
  return useContext(ToastContext);
}
