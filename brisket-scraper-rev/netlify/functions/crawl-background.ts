import type { Context } from '@netlify/functions'
import { getStore } from '@netlify/blobs'
import robotsParser from 'robots-parser'
import { decodeResponse } from './shared/encoding'
import { extractMainContent } from './shared/normalize'
import { findNextUrl } from './shared/pagination'
import { validateUrlOrThrow, delay, sameOriginFilter } from './shared/security'

const STORE = 'brisket-scraper'
const UA = 'brisket-scraper/1.0 (+https://example.com)'

async function update(store: ReturnType<typeof getStore>, jobId: string, patch: any) {
  const key = `jobs/${jobId}.json`
  const cur = await store.get(key)
  const obj = cur ? JSON.parse(cur) : {}
  const merged = { ...obj, ...patch, updatedAt: new Date().toISOString() }
  await store.set(key, JSON.stringify(merged))
}

async function appendLog(store: ReturnType<typeof getStore>, jobId: string, line: string) {
  const key = `jobs/${jobId}.json`
  const cur = await store.get(key)
  const obj = cur ? JSON.parse(cur) : {}
  obj.logs = (obj.logs || [])
  const ts = new Date().toISOString().replace('T',' ').replace('Z','')
  obj.logs.push(`[${ts}] ${line}`)
  await store.set(key, JSON.stringify(obj))
}

export default async (req: Request, context: Context) => {
  try {
    if (req.method !== 'POST') return new Response('', { status: 405 })
    const { jobId } = await req.json()
    if (!jobId) return new Response('', { status: 400 })
    const store = getStore(STORE)
    const key = `jobs/${jobId}.json`
    const cur = await store.get(key)
    if (!cur) return new Response('', { status: 404 })
    const record = JSON.parse(cur)
    await update(store, jobId, { status: 'running' })
    await appendLog(store, jobId, 'Worker started')

    const { startUrl, linkSelector, nextText, sameOriginOnly, maxPages, baseDelayMs } = record.params
    validateUrlOrThrow(startUrl)
    let pageUrl: string | null = startUrl
    let page = 0
    let robots: ReturnType<typeof robotsParser> | null = null
    const origin = new URL(startUrl).origin
    // fetch robots.txt
    try {
      const robotsUrl = new URL('/robots.txt', origin).toString()
      const r = await fetch(robotsUrl, { redirect: 'follow', headers: { 'user-agent': UA } })
      const txt = r.ok ? await r.text() : ''
      robots = robotsParser(robotsUrl, txt)
      const cd = robots.getCrawlDelay(UA) ?? robots.getCrawlDelay('*')
      if (cd) await appendLog(store, jobId, `robots.txt crawl-delay: ${cd}s`)
    } catch {}

    while (pageUrl && page < maxPages) {
      page++
      await appendLog(store, jobId, `Fetching page ${page}: ${pageUrl}`)
      // robots allow?
      if (robots) {
        const allowed = robots.isAllowed(pageUrl, UA)
        if (allowed === false) {
          await appendLog(store, jobId, `Blocked by robots.txt: ${pageUrl}`)
          break
        }
      }
      const res = await fetch(pageUrl, { redirect: 'follow', headers: { 'user-agent': UA } })
      if (!res.ok) {
        await appendLog(store, jobId, `Fetch failed (${res.status})`)
        break
      }
      const { html } = await decodeResponse(res)

      // collect links
      const links = collectLinks(html, pageUrl, linkSelector, sameOriginOnly ? origin : null)
      await appendLog(store, jobId, `Found ${links.length} links`)

      // scrape each link (sequential with small delay to be gentle)
      const items: any[] = []
      for (const link of links) {
        if (robots) {
          const allowed = robots.isAllowed(link, UA)
          if (allowed === false) { await appendLog(store, jobId, `Skip (robots): ${link}`); continue }
        }
        try {
          const rr = await fetch(link, { redirect: 'follow', headers: { 'user-agent': UA } })
          if (!rr.ok) { await appendLog(store, jobId, `Skip (${rr.status}) ${link}`); continue }
          const { html: subHtml } = await decodeResponse(rr)
          const extracted = extractMainContent(subHtml, link)
          // discard very short text
          if ((extracted.content_text || '').trim().length < 120) {
            await appendLog(store, jobId, `Skip (too short) ${link}`)
            continue
          }
          items.push({ url: link, ...extracted })
          // write partial progress
          const cur = await store.get(key)
          const obj = cur ? JSON.parse(cur) : {}
          obj.items = [...(obj.items || []), ...items.splice(0)]
          obj.progress = { page, pagesCrawled: page, itemsCollected: obj.items.length }
          await store.set(key, JSON.stringify(obj))
        } catch (e:any) {
          await appendLog(store, jobId, `Error scraping ${link}: ${e.message || e}`)
        }
        // politeness delay with jitter
        const jitter = baseDelayMs * (0.8 + Math.random()*0.4)
        await delay(jitter)
      }

      // next page
      const next = findNextUrl(html, pageUrl, nextText)
      if (!next) {
        await appendLog(store, jobId, 'No next page found; finishing.')
        break
      }
      pageUrl = next
      await update(store, jobId, { progress: { page, pagesCrawled: page, itemsCollected: (JSON.parse((await store.get(key)) || '{}').items || []).length } })
    }

    await update(store, jobId, { status: 'completed' })
    await appendLog(store, jobId, 'Worker finished')
    return new Response('', { status: 202 })
  } catch (e:any) {
    return new Response('', { status: 500 })
  }
}

function collectLinks(html: string, baseUrl: string, selector: string, sameOrigin: string | null): string[] {
  // simple regex-free parse via JSDOM would be heavy; here we approximate:
  // But to be precise, use DOM parsing with jsdom in extractor module? Keep light here.
  // We'll do a minimal DOM parse.
  const { JSDOM } = require('jsdom')
  const dom = new JSDOM(html, { url: baseUrl })
  const doc = dom.window.document
  const as = Array.from(doc.querySelectorAll(selector || 'a[href]'))
  const urls = as.map(a => {
    const href = a.getAttribute('href') || ''
    try { return new URL(href, baseUrl).toString() } catch { return '' }
  }).filter(Boolean)
  return sameOrigin ? urls.filter(u => new URL(u).origin === sameOrigin) : urls
}