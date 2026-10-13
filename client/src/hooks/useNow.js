import { useEffect, useState } from 'react';

/** Current time, refreshed every `ms` so countdowns ("due in 12 min") stay accurate. */
export default function useNow(ms = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}