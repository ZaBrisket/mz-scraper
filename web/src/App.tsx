import React, { useRef, useState } from 'react';
import { inferSchema, startJob, pollEvents } from './lib/api';
import { download, toCSV, toJSONL, toTXT } from './lib/exporters';
import { saveProfile, findProfile } from './lib/siteProfiles';

interface Item { url: string; title?: string; description?: string; author?: string; published_at?: string; text?: string; }

export default function App() {
  const [jobId, setJobId] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [lastSeq, setLastSeq] = useState(0);

  const startUrlRef = useRef<HTMLInputElement>(null);
  const subPageRef = useRef<HTMLInputElement>(null);
  const linkSelectorRef = useRef<HTMLInputElement>(null);
  const nextTextRef = useRef<HTMLInputElement>(null);
  const maxPagesRef = useRef<HTMLInputElement>(null);
  const sameOriginRef = useRef<HTMLInputElement>(null);
  const urlListRef = useRef<HTMLTextAreaElement>(null);
  const delayRef = useRef<HTMLInputElement>(null);

  const hydrate = (u: string) => {
    try {
      const p = findProfile(new URL(u).origin);
      if (p) {
        if (linkSelectorRef.current) linkSelectorRef.current.value = p.link_selector;
        if (nextTextRef.current) nextTextRef.current.value = p.next_button_text;
      }
    } catch {}
  };

  const onInfer = async (e: React.MouseEvent) => {
    e.preventDefault();
    const payload = {
      startUrl: startUrlRef.current?.value || '',
      subPageExample: subPageRef.current?.value || '',
      nextButtonText: nextTextRef.current?.value || '',
    };
    const r = await inferSchema(payload);
    if (r.ok) {
      if (linkSelectorRef.current) linkSelectorRef.current.value = r.schema.linkSelector;
      if (nextTextRef.current) nextTextRef.current.value = r.schema.nextButtonText;
      try {
        saveProfile({
          origin: new URL(payload.startUrl).origin,
          link_selector: r.schema.linkSelector,
          next_button_text: r.schema.nextButtonText,
          updated_at: new Date().toISOString(),
        });
      } catch {}
    }
  };

  const onStart = async (e: React.FormEvent) => {
    e.preventDefault();
    const urlList = urlListRef.current?.value.trim();
    const payload: any = urlList
      ? {
          urls: urlList.split(/\n+/).map(u => u.trim()).filter(Boolean),
          baseDelayMs: parseInt(delayRef.current?.value || '0', 10),
        }
      : {
          startUrl: startUrlRef.current?.value || '',
          subPageExample: subPageRef.current?.value || '',
          nextButtonText: nextTextRef.current?.value || '',
          linkSelector: linkSelectorRef.current?.value || '',
          sameOriginOnly: !!sameOriginRef.current?.checked,
          maxPages: parseInt(maxPagesRef.current?.value || '1', 10),
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
        <div><label>Start URL<br /><input type="url" ref={startUrlRef} onBlur={e => hydrate(e.target.value)} /></label></div>
        <div><label>Sub-page example<br /><input type="url" ref={subPageRef} /></label></div>
        <div><label>Link selector<br /><input type="text" ref={linkSelectorRef} /></label></div>
        <div><label>Next button text<br /><input type="text" defaultValue="next" ref={nextTextRef} /></label></div>
        <div><label>Max pages<br /><input type="number" defaultValue={25} ref={maxPagesRef} /></label></div>
        <div><label>Same-origin only <input type="checkbox" defaultChecked ref={sameOriginRef} /></label></div>
        <div><label>URL list<br /><textarea ref={urlListRef} rows={4}></textarea></label></div>
        <div><label>Base delay (ms)<br /><input type="number" defaultValue={1000} ref={delayRef} /></label></div>
        <div>
          <button type="button" onClick={onInfer}>Infer</button>
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

