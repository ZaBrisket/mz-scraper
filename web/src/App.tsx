import React, { useEffect, useState } from 'react';
import JobForm from './components/JobForm';
import ProgressLog from './components/ProgressLog';
import ResultsTable from './components/ResultsTable';
import { streamEvents, pollEvents } from './lib/api';

type Item = { url: string; title?: string; description?: string; author?: string; published_at?: string; text?: string; };

export default function App() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [lastSeq, setLastSeq] = useState<number>(0);
  const [usingPoll, setUsingPoll] = useState<boolean>(false);

  useEffect(() => {
    if (!jobId) return;
    let stopSSE: null | (() => void) = null;
    let pollTimer: any = null;

    const onEvent = (type: string, ev: any) => {
      if (type === 'log') {
        setLogs((prev) => [...prev, `[${ev.at}] ${ev.level ? ev.level.toUpperCase()+': ' : ''}${ev.msg}`].slice(-1000));
        setLastSeq((s) => s + 1);
      }
      if (type === 'item') {
        setItems((prev) => [...prev, ev.item]);
        setLastSeq((s) => s + 1);
      }
      if (type === 'done') {
        setLogs((prev) => [...prev, `DONE. Items: ${ev.items}`]);
      }
    };

    const startPoll = () => {
      setUsingPoll(true);
      const step = async () => {
        try {
          const r = await pollEvents(jobId, lastSeq);
          if (r.ok) {
            for (const ev of r.events) onEvent(ev.type, ev);
            setLastSeq(r.last);
          }
        } catch {}
        pollTimer = setTimeout(step, 1000);
      };
      step();
    };

    stopSSE = streamEvents(jobId, lastSeq, onEvent, () => {}, () => {
      // SSE failed — switch to long-poll
      startPoll();
    });

    return () => {
      stopSSE && stopSSE();
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [jobId]);

  return (
    <>
      <header><div className="container"><h2>mz-scraper</h2><small className="dim"> — brisketscraper.com</small></div></header>
      <main className="container">
        <JobForm onStarted={setJobId} />
        
        <div className="card">
          <div className="controls">
            <button disabled={!jobId} onClick={async ()=>{ if (!jobId) return; await fetch(`/api/jobs/${jobId}/pause`, { method: 'POST' }); }}>Pause</button>
            <button disabled={!jobId} onClick={async ()=>{ if (!jobId) return; await fetch(`/api/jobs/${jobId}/resume`, { method: 'POST' }); }}>Resume</button>
            <button disabled={!jobId} onClick={async ()=>{ if (!jobId) return; await fetch(`/api/jobs/${jobId}/stop`, { method: 'POST' }); }}>Stop</button>
          </div>
        </div>
    
        <ProgressLog logs={logs} />
        <ResultsTable items={items} />
      </main>
      <footer>Netlify Functions + Background Functions + Blobs. Polite scraping with robots/SSRF/throttle/backoff.</footer>
    </>
  );
}
