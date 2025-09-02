import type { Context } from '@netlify/functions'
import { getStore } from '@netlify/blobs'

const STORE = 'brisket-scraper'

export default async (req: Request, context: Context) => {
  const url = new URL(req.url)
  const jobId = url.searchParams.get('jobId')
  const format = (url.searchParams.get('format') || 'json').toLowerCase()
  if (!jobId) return new Response('Missing jobId', { status: 400 })
  const store = getStore(STORE)
  const cur = await store.get(`jobs/${jobId}.json`)
  if (!cur) return new Response('Not found', { status: 404 })
  const job = JSON.parse(cur)

  if (format === 'json') {
    return new Response(JSON.stringify(job.items || []), { headers: { 'content-type': 'application/json', 'content-disposition': `attachment; filename="job-${jobId}.json"` } })
  }
  if (format === 'txt') {
    const txt = (job.items || []).map((it: any) => `URL: ${it.url}\nTITLE: ${it.title || ''}\nBYLINE: ${it.byline || ''}\nPUBLISHED: ${it.published || ''}\n\n${it.content_text}\n\n---\n`).join('\n')
    return new Response(txt, { headers: { 'content-type': 'text/plain; charset=utf-8', 'content-disposition': `attachment; filename="job-${jobId}.txt"` } })
  }
  if (format === 'csv') {
    const rows = [['url', 'title', 'byline', 'published', 'content_text']]
    for (const it of (job.items || [])) {
      rows.push([
        safeCsv(it.url),
        safeCsv(it.title || ''),
        safeCsv(it.byline || ''),
        safeCsv(it.published || ''),
        safeCsv((it.content_text || '').replace(/\s+/g,' ').trim())
      ])
    }
    const csv = rows.map(r => r.join(',')).join('\n')
    return new Response(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="job-${jobId}.csv"` } })
  }
  return new Response('Unsupported format', { status: 400 })
}

function safeCsv(s: string) {
  const needs = /[",\n]/.test(s)
  const escaped = s.replace(/"/g, '""')
  return needs ? `"${escaped}"` : escaped
}