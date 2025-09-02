import type { Context } from '@netlify/functions'
import { decodeResponse } from './shared/encoding'
import { inferSelectors } from './shared/infer'
import { validateUrlOrThrow } from './shared/security'

export default async (req: Request, context: Context) => {
  try {
    if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })
    const body = await req.json()
    const startUrl = String(body?.startUrl || '')
    const sameOriginOnly = Boolean(body?.sameOriginOnly ?? true)
    const u = validateUrlOrThrow(startUrl)
    const res = await fetch(u.toString(), { redirect: 'follow', headers: { 'user-agent': 'brisket-scraper/1.0 (+https://example.com)' } })
    if (!res.ok) return Response.json({ ok: false, error: `Fetch failed (${res.status})` }, { status: 400 })
    const { html } = await decodeResponse(res)
    const inferred = inferSelectors(html, u.toString(), sameOriginOnly)
    return Response.json({ ok: true, inferred, warnings: [] })
  } catch (e:any) {
    return Response.json({ ok:false, error: e.message ?? String(e) }, { status: 500 })
  }
}