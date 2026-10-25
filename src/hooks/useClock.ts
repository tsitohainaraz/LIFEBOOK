import { useEffect, useState } from 'react';
import { currentDate } from '../lib/serverTime';

/** Date actuelle, rafraîchie toutes les `intervalMs` millisecondes. */
export function useClock(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => currentDate());
  useEffect(() => {
    const id = setInterval(() => setNow(currentDate()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
