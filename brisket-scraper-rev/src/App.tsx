import React, { useMemo, useState, useEffect } from 'react'
import { apiInfer, apiStartJob, apiGetJob, apiExport } from './lib/api'
import type { JobRecord } from './lib/types'

export default function App() {
  const [startUrl, setStartUrl] = useState('https://quotes.toscrape.com/')
  const [linkSelector, setLinkSelector] = useState('article a, .quote a[href*="/tag/"], .quote a[href*="/author/"]')
  const [nextText, setNextText] = useState('Next')
  const [maxPages, setMaxPages] = useState(3)
  const [baseDelayMs, setBaseDelayMs] = useState(800)
  const [sameOriginOnly, setSameOriginOnly] = useState(true)

  const [inferLog, setInferLog] = useState<string[]>([])
  const [job, setJob] = useState<JobRecord | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)

  const canStart = startUrl && linkSelector

  async function doInfer() {
    setInferLog((l) => [...l, 'Inferring...'])
    try {
      const res = await apiInfer({ startUrl, sameOriginOnly })
      if (res.inferred?.linkSelector) setLinkSelector(res.inferred.linkSelector)
      if (res.inferred?.nextText) setNextText(res.inferred.nextText)
      setInferLog((l) => [...l, 'Inference complete', ...(res.inferred?.notes || []), ...(res.warnings || [])])
    } catch (e:any) {
      setInferLog((l) => [...l, 'Inference failed: ' + e.message])
    }
  }

  async function doStart() {
    try {
      const res = await apiStartJob({ startUrl, linkSelector, nextText: nextText || undefined, sameOriginOnly, maxPages, baseDelayMs })
      setJobId(res.jobId)
    } catch (e:any) {
      alert('Start failed: ' + e.message)
    }
  }

  useEffect(() => {
    if (!jobId) return
    let timer: any
    const poll = async () => {
      try {
        const j = await apiGetJob(jobId)
        setJob(j)
        if (j.status === 'running' || j.status === 'queued') {
          timer = setTimeout(poll, 1200)
        }
      } catch (e) {
        console.error('poll error', e)
      }
    }
    poll()
    return () => timer && clearTimeout(timer)
  }, [jobId])

  return (
    <div className="container">
      <h1>Brisket Scraper</h1>
      <div className="grid">
        <div className="panel">
          <h3>Job Setup</h3>
          <div>
            <label>Start URL</label>
            <input type="text" value={startUrl} onChange={e => setStartUrl(e.target.value)} placeholder="https://example.com/list" />
          </div>
          <div>
            <label>Link selector (CSS)</label>
            <input type="text" value={linkSelector} onChange={e => setLinkSelector(e.target.value)} placeholder="article a" />
          </div>
          <div className="grid" style={{gridTemplateColumns:'1fr 1fr'}}>
            <div>
              <label>Next button text (optional)</label>
              <input type="text" value={nextText} onChange={e => setNextText(e.target.value)} placeholder="Next ›" />
            </div>
            <div>
              <label>Max pages</label>
              <input type="number" value={maxPages} onChange={e => setMaxPages(parseInt(e.target.value,10)||1)} />
            </div>
          </div>
          <div className="grid" style={{gridTemplateColumns:'1fr 1fr'}}>
            <div>
              <label>Base delay (ms)</label>
              <input type="number" value={baseDelayMs} onChange={e => setBaseDelayMs(parseInt(e.target.value,10)||0)} />
            </div>
            <div className="checkbox" style={{marginTop: 26}}>
              <input id="chk-so" type="checkbox" checked={sameOriginOnly} onChange={e => setSameOriginOnly(e.target.checked)} />
              <label htmlFor="chk-so" style={{margin:0}}>Same-origin links only</label>
            </div>
          </div>

          <div className="row" style={{marginTop:12, gap: 12}}>
            <button onClick={doInfer}>Pre‑flight / Infer</button>
            <button className="primary" onClick={doStart} disabled={!canStart}>Start</button>
            {job && job.items?.length > 0 && (
              <>
                <button onClick={() => apiExport(job.id, 'csv')}>Export CSV</button>
                <button onClick={() => apiExport(job.id, 'json')}>Export JSON</button>
                <button onClick={() => apiExport(job.id, 'txt')}>Export TXT</button>
              </>
            )}
          </div>
          <div style={{marginTop:12}}>
            <label>Pre‑flight log</label>
            <pre className="log">{inferLog.join('\n')}</pre>
          </div>
        </div>

        <div className="panel">
          <h3>Job Status</h3>
          {!job && <div className="small">Start a job to see live progress</div>}
          {job && (
            <>
              <div className="row" style={{gap:8}}>
                <span className="badge">id: {job.id}</span>
                <span className="badge">status: {job.status}</span>
                <span className="badge">pages: {job.progress.pagesCrawled}</span>
                <span className="badge">items: {job.progress.itemsCollected}</span>
              </div>
              <div style={{marginTop:12}}>
                <label>Logs</label>
                <pre className="log">{job.logs.join('\n')}</pre>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="panel" style={{marginTop:16}}>
        <h3>Results</h3>
        {!job?.items?.length && <div className="small">No items yet</div>}
        {job?.items?.length ? (
          <table>
            <thead>
              <tr><th>URL</th><th>Title</th><th>Byline</th><th>Published</th><th>Excerpt</th></tr>
            </thead>
            <tbody>
            {job.items.map((it, i) => (
              <tr key={i}>
                <td style={{wordBreak:'break-all'}}><a href={it.url} target="_blank" rel="noreferrer">{it.url}</a></td>
                <td>{it.title || ''}</td>
                <td>{it.byline || ''}</td>
                <td>{it.published || ''}</td>
                <td className="small">{it.content_text.slice(0, 200)}{it.content_text.length>200?'…':''}</td>
              </tr>
            ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </div>
  )
}