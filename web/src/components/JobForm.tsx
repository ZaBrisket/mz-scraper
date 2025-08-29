import React, { useState } from 'react';
import { inferSchema, startJob } from '../lib/api';
import { saveProfile, findProfile } from '../lib/siteProfiles';

type Props = { onStarted: (jobId: string) => void };

export default function JobForm({ onStarted }: Props) {
  const [startUrl, setStartUrl] = useState('');
  const [subPageExample, setSubPageExample] = useState('');
  const [linkSelector, setLinkSelector] = useState('');
  const [nextButtonText, setNextButtonText] = useState('next');
  const [maxPages, setMaxPages] = useState(25);
  const [sameOriginOnly, setSameOriginOnly] = useState(true);
  const [baseDelayMs, setBaseDelayMs] = useState(1000);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const hydrateFromProfile = (origin: string) => {
    const p = findProfile(origin);
    if (p) { setLinkSelector(p.link_selector); setNextButtonText(p.next_button_text); }
  };

  const onChangeStart = (u: string) => {
    setStartUrl(u);
    try { const origin = new URL(u).origin; hydrateFromProfile(origin); } catch {}
  };

  async function handleInfer() {
    setBusy(true); setMsg('Inferring schema...');
    const r = await inferSchema({ startUrl, subPageExample, nextButtonText });
    setBusy(false);
    if (r.ok) {
      setLinkSelector(r.schema.linkSelector);
      setNextButtonText(r.schema.nextButtonText);
      const origin = new URL(startUrl).origin;
      saveProfile({ origin, link_selector: r.schema.linkSelector, next_button_text: r.schema.nextButtonText, updated_at: new Date().toISOString() });
      setMsg('Schema inferred and saved to local profiles.');
    } else setMsg(r.error || 'Inference failed');
  }

  async function handleStart() {
    setBusy(true); setMsg('Starting job...');
    const payload = { startUrl, subPageExample, nextButtonText, linkSelector, sameOriginOnly, maxPages, baseDelayMs };
    const r = await startJob(payload);
    setBusy(false);
    if (r.ok) onStarted(r.jobId); else setMsg(r.error || 'Failed to start job');
  }

  return (
    <div className="card">
      <h3>Start a new scrape</h3>
      <div className="row">
        <div>
          <label>Start URL</label>
          <input type="url" placeholder="https://example.com" value={startUrl} onChange={e => onChangeStart(e.target.value)} />
        </div>
        <div>
          <label>Sub-page example (optional)</label>
          <input type="url" placeholder="https://example.com/post/123" value={subPageExample} onChange={e => setSubPageExample(e.target.value)} />
        </div>
      </div>
      <div className="row">
        <div>
          <label>Link selector</label>
          <input type="text" placeholder="a[href^='/posts']" value={linkSelector} onChange={e => setLinkSelector(e.target.value)} />
        </div>
        <div>
          <label>Next button text</label>
          <input type="text" placeholder="next" value={nextButtonText} onChange={e => setNextButtonText(e.target.value)} />
        </div>
      </div>
      <div className="row">
        <div>
          <label>Max pages</label>
          <input type="number" min={1} max={500} value={maxPages} onChange={e => setMaxPages(parseInt(e.target.value||'1', 10))} />
        </div>
        <div>
          <label>Base delay (ms)</label>
          <input type="number" min={0} max={10000} value={baseDelayMs} onChange={e => setBaseDelayMs(parseInt(e.target.value||'0',10))} />
        </div>
        <div>
          <label><input type="checkbox" checked={sameOriginOnly} onChange={e => setSameOriginOnly(e.target.checked)} /> Same-origin only</label>
        </div>
      </div>
      <div className="controls">
        <button disabled={busy || !startUrl} onClick={handleInfer}>Pre-flight / Infer</button>
        <button disabled={busy || !startUrl || !linkSelector} onClick={handleStart}>Start</button>
        <span className="badge">{busy ? 'Working…' : 'Ready'}</span>
        <span>{msg}</span>
      </div>
    </div>
  );
}
