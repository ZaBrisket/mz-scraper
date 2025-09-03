import React, { useRef, useState } from 'react';
import { startJob, pollEvents } from './lib/api';
import { download, toCSV, toJSONL, toTXT } from './lib/exporters';

interface Item { url: string; title?: string; description?: string; author?: string; published_at?: string; text?: string; }

export default function App() {
  const [jobId, setJobId] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [lastSeq, setLastSeq] = useState(0);

  const urlListRef = useRef<HTMLTextAreaElement>(null);
  const delayRef = useRef<HTMLInputElement>(null);

  const onStart = async (e: React.FormEvent) => {
    e.preventDefault();
    const urlList = urlListRef.current?.value.trim() || '';
    const payload = {
      urls: urlList.split(/\n+/).map(u => u.trim()).filter(Boolean),
      baseDelayMs: parseInt(delayRef.current?.value || '0', 10),
    };
    const r = await startJob(payload);
    if (r.ok) {
      setJobId(r.jobId);
      setLogs([]);
      setItems([]);
      setLastSeq(0);
    }
  };

  const onRefresh = async () => {
    if (!jobId) return;
    const r = await pollEvents(jobId, lastSeq);
    if (r.ok) {
      for (const ev of r.events) {
        if (ev.type === 'log') {
          setLogs(prev => [...prev, `[${ev.at}] ${ev.level ? ev.level.toUpperCase() + ': ' : ''}${ev.msg}`].slice(-1000));
        } else if (ev.type === 'item') {
          setItems(prev => [...prev, ev.item]);
        } else if (ev.type === 'done') {
          setLogs(prev => [...prev, `DONE. Items: ${ev.items}`]);
        }
      }
      setLastSeq(r.last);
    }
  };

  const action = async (name: string) => {
    if (!jobId) return;
    try {
      const r = await fetch(`/api/jobs/${jobId}/${name}`, { method: 'POST' });
      if (!r.ok) setLogs(l => [...l, `${name} failed`]);
    } catch {
      setLogs(l => [...l, `${name} request failed`]);
    }
  };

  return (
    <div>
      <h1>mz-scraper</h1>
      <form onSubmit={onStart}>
        <div><label>URL list<br /><textarea ref={urlListRef} rows={4}></textarea></label></div>
        <div><label>Base delay (ms)<br /><input type="number" defaultValue={1000} ref={delayRef} /></label></div>
        <div>
          <button type="submit">Start</button>
        </div>
      </form>
      <div>
        <p>Job ID: {jobId || 'None'}</p>
        <p>
          <button disabled={!jobId} onClick={() => action('pause')}>Pause</button>
          <button disabled={!jobId} onClick={() => action('resume')}>Resume</button>
          <button disabled={!jobId} onClick={() => action('stop')}>Stop</button>
          <button disabled={!jobId} onClick={onRefresh}>Refresh</button>
        </p>
        <pre>{logs.join('\n')}</pre>
      </div>
      <table>
        <thead><tr><th>URL</th><th>Title</th><th>Author</th><th>Published</th></tr></thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i}>
              <td><a href={it.url} target="_blank" rel="noreferrer">{it.url}</a></td>
              <td>{it.title}</td>
              <td>{it.author}</td>
              <td>{it.published_at}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div>
        <a href="#" onClick={e => { e.preventDefault(); download('results.csv', toCSV(items), 'text/csv'); }}>Export CSV</a>
        {' | '}
        <a href="#" onClick={e => { e.preventDefault(); download('results.jsonl', toJSONL(items), 'application/json'); }}>Export JSONL</a>
        {' | '}
        <a href="#" onClick={e => { e.preventDefault(); download('results.txt', toTXT(items), 'text/plain'); }}>Export TXT</a>
      </div>
    </div>
  );
}

