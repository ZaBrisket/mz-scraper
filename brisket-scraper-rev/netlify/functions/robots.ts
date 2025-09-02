import type { Context } from '@netlify/functions'
import robotsParser from 'robots-parser'

export default async (req: Request, context: Context) => {
  const url = new URL(req.url)
  const target = url.searchParams.get('url')
  if (!target) return new Response('Missing url', { status: 400 })
  let origin: URL
  try { origin = new URL(target) } catch { return new Response('Invalid url', { status: 400 }) }
  const robotsUrl = new URL('/robots.txt', origin.origin).toString()
  const res = await fetch(robotsUrl, { redirect: 'follow' })
  const text = res.ok ? await res.text() : ''
  const rp = robotsParser(robotsUrl, text)
  const can = rp.isAllowed(target, 'brisket-scraper/1.0')
  const crawlDelay = rp.getCrawlDelay('brisket-scraper/1.0') ?? rp.getCrawlDelay('*') ?? null
  return Response.json({ ok: true, robotsUrl, allowed: can !== false, crawlDelay })
}