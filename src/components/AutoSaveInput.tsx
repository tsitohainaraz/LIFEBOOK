import { useEffect, useRef, useState, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';

const DELAY = 700;

/** Garde la valeur locale pendant la saisie et l'enregistre après une courte pause. */
function useAutoSave(value: string, onSave: (v: string) => void) {
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
    }, DELAY);
  };
  return [local, change] as const;
}

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string;
  onSave: (v: string) => void;
};

export function AutoSaveInput({ value, onSave, ...rest }: InputProps) {
  const [local, change] = useAutoSave(value, onSave);
  return <input {...rest} value={local} onChange={(e) => change(e.target.value)} />;
}

type AreaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  value: string;
  onSave: (v: string) => void;
};

export function AutoSaveTextarea({ value, onSave, ...rest }: AreaProps) {
  const [local, change] = useAutoSave(value, onSave);
  return <textarea {...rest} value={local} onChange={(e) => change(e.target.value)} />;
}
