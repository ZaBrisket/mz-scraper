import type { Context } from '@netlify/functions'
import { getStore } from '@netlify/blobs'
import { randomUUID } from 'node:crypto'
import { validateUrlOrThrow } from './shared/security'

const STORE = 'brisket-scraper'

export default async (req: Request, context: Context) => {
  const url = new URL(req.url)
  if (req.method === 'GET') {
    // /jobs/:id
    const parts = url.pathname.split('/')
    const id = parts[parts.length - 1]
    const store = getStore(STORE)
    const cur = await store.get(`jobs/${id}.json`)
    if (!cur) return new Response('Not found', { status: 404 })
    return new Response(cur, { headers: { 'content-type': 'application/json' } })
  }

  if (req.method === 'POST') {
    const body = await req.json()
    const { startUrl, linkSelector } = body || {}
    if (!startUrl || !linkSelector) return new Response('Missing fields', { status: 400 })
    validateUrlOrThrow(String(startUrl))
    const jobId = randomUUID()
    const now = new Date().toISOString()
    const record = {
      id: jobId,
      createdAt: now,
      updatedAt: now,
      status: 'queued',
      params: {
        startUrl: String(startUrl),
        linkSelector: String(linkSelector),
        nextText: body?.nextText || undefined,
        sameOriginOnly: Boolean(body?.sameOriginOnly ?? true),
        maxPages: Number(body?.maxPages ?? 3),
        baseDelayMs: Number(body?.baseDelayMs ?? 800),
      },
      progress: { page: 0, pagesCrawled: 0, itemsCollected: 0 },
      logs: ['Job queued'],
      items: [] as any[],
    }
    const store = getStore(STORE)
    await store.set(`jobs/${jobId}.json`, JSON.stringify(record))

    // Invoke background worker
    const invokeUrl = new URL('/.netlify/functions/crawl-background', url.origin).toString()
    await fetch(invokeUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jobId }) })

    return Response.json({ ok: true, jobId, status: 'queued' }, { status: 202 })
  }

  return new Response('Method Not Allowed', { status: 405 })
}