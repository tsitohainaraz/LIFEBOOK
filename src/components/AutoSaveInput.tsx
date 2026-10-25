import { useEffect, useRef, useState, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';

const DELAY = 700;

/** Garde la valeur locale pendant la saisie et l'enregistre après une courte pause. */
function useAutoSave(value: string, onSave: (v: string) => void, delay = DELAY) {
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const typing = useRef(false);
  const saveRef = useRef(onSave);
  saveRef.current = onSave;

  useEffect(() => {
    if (!typing.current) setLocal(value);
  }, [value]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const change = (v: string) => {
    setLocal(v);
    typing.current = true;
    clearTimeout(timer.current);
    const save = saveRef.current;
    timer.current = setTimeout(() => {
      typing.current = false;
      save(v);
    }, delay);
  };
  return [local, change] as const;
}

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string;
  onSave: (v: string) => void;
  /** Pause (ms) avant l'enregistrement ; 700 par défaut. */
  delay?: number;
};

export function AutoSaveInput({ value, onSave, delay, ...rest }: InputProps) {
  const [local, change] = useAutoSave(value, onSave, delay);
  return <input {...rest} value={local} onChange={(e) => change(e.target.value)} />;
}

type AreaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  value: string;
  onSave: (v: string) => void;
  /** Pause (ms) avant l'enregistrement ; 700 par défaut. */
  delay?: number;
};

export function AutoSaveTextarea({ value, onSave, delay, ...rest }: AreaProps) {
  const [local, change] = useAutoSave(value, onSave, delay);
  return <textarea {...rest} value={local} onChange={(e) => change(e.target.value)} />;
}
