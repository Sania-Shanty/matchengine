// Fetches data now, then again every few milliseconds, so the screen stays "live".
//
//   const book = usePolling(() => api.orderBook('TCS'), 2000, ['TCS']);
//   book.data     the latest result (null until the first one arrives)
//   book.error    the latest error (null if the last fetch worked)
//   book.loading  true until the first fetch finishes
//   book.refresh  fetch again right now

import { useCallback, useEffect, useRef, useState } from 'react';

export default function usePolling(fetcher, intervalMs, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher; // always call the newest version

  const runRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    setLoading(true);

    async function run() {
      try {
        const result = await fetcherRef.current();
        if (!cancelled) {
          setData(result);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    runRef.current = run;
    run();
    const timer = setInterval(run, intervalMs);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const refresh = useCallback(() => {
    if (runRef.current) runRef.current();
  }, []);

  return { data, error, loading, refresh };
}