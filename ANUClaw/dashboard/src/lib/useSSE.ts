import { useEffect, useRef, useState } from 'react';

export interface SSEEvent {
  type: string;
  ts: number;
  payload: Record<string, unknown>;
}

export function useSSE(maxEvents = 100): SSEEvent[] {
  const [events, setEvents] = useState<SSEEvent[]>([]);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource('/api/stream', { withCredentials: true });
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const evt: SSEEvent = JSON.parse(e.data);
        setEvents(prev => [evt, ...prev].slice(0, maxEvents));
      } catch { /* skip malformed */ }
    };

    return () => es.close();
  }, [maxEvents]);

  return events;
}
