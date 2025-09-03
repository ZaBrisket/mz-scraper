import type { Context } from "@netlify/functions";
import { z } from 'zod';
import { inferSelectors } from './lib/inference';
import { assertUrlIsSafe } from './lib/ssrf';
import { isAllowedByRobots } from './lib/robots';
import { getState, putState, appendEvent, listEventsAfter, listItems } from './lib/blobs';
import type { Job, Event, Item } from './lib/types';

const WEB_ORIGIN = process.env.WEB_ORIGIN || 'https://brisketscraper.com';
const USER_AGENT = process.env.USER_AGENT || 'mz-scraper/0.1 (+https://brisketscraper.com)';
const REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS || '15000', 10);

function json(data: any, init: any = {}) { return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json', ...(init.headers||{}) }, status: init.status || 200 }); }
function bad(msg: string, code = 400) { return json({ ok: false, error: msg }, { status: code }); }

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  // Support both Netlify function invocation styles:
  // - /.netlify/functions/api/* (default when using functions)
  // - /api/* via redirect/proxy during local dev
  const path = url.pathname
    .replace(/^\/\.netlify\/functions\/api/, '')
    .replace(/^\/api/, '') || '/';
  const method = req.method.toUpperCase();

  // CORS (if you ever host SPA elsewhere; for same-origin this is harmless)
  const corsHeaders = {
    'Access-Control-Allow-Origin': WEB_ORIGIN,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
  if (method === 'OPTIONS') return new Response('', { status: 204, headers: corsHeaders });

  // Routes
  if (method === 'POST' && path === '/schema') {
    try {
      const body = await req.json();
      const schema = await inferSelectors(body);
      return json({ ok: true, schema }, { headers: corsHeaders });
    } catch (e: any) { return bad(String(e?.message || e)); }
  }

  if (method === 'GET' && path.startsWith('/fetch')) {
    const target = url.searchParams.get('url') || '';
    try {
      await assertUrlIsSafe(target);
      const okByRobots = await isAllowedByRobots(target, USER_AGENT);
      if (!okByRobots) return bad('Blocked by robots.txt', 403);
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      const r = await fetch(target, { redirect: 'follow', headers: { 'User-Agent': USER_AGENT }, signal: controller.signal });
      clearTimeout(t);
      const text = await r.text();
      return new Response(text, { status: r.status, headers: { 'content-type': 'text/html; charset=utf-8', ...corsHeaders } });
    } catch (e: any) { return bad(String(e?.message || e)); }
  }

  if (method === 'POST' && path === '/jobs') {
    const StartCfg = z.object({
      startUrl: z.string().url(),
      subPageExample: z.string().url().optional(),
      nextButtonText: z.string().optional(),
      linkSelector: z.string().optional(),
      sameOriginOnly: z.boolean().default(true),
      maxPages: z.number().int().min(1).max(500).default(50),
      baseDelayMs: z.number().int().min(0).max(10000).default(1000)
    });
    const UrlListCfg = z.object({
      urls: z.array(z.string().url()).min(1),
      baseDelayMs: z.number().int().min(0).max(10000).default(1000)
    });
    const Body = z.union([StartCfg, UrlListCfg]);

    let body: z.infer<typeof Body>;
    try { body = Body.parse(await req.json()); } catch (e: any) { return bad('Invalid body'); }
    const id = Math.random().toString(36).slice(2);
    let origin = 'startUrl' in body ? new URL(body.startUrl).origin : '';
    if ('urls' in body) {
      try { origin = new URL(body.urls[0]).origin; }
      catch { origin = 'about:blank'; }
    }
    const job: Job = { id, origin, status: 'queued', pages_seen: 0, items_emitted: 0, started_at: new Date().toISOString() };
    await putState(job);
    await appendEvent(id, { type: 'log', at: new Date().toISOString(), msg: `Job ${id} queued` });

    // Invoke background function
    const invokeUrl = new URL('/.netlify/functions/run-job-background', url.origin).toString();
    try {
      const r = await fetch(invokeUrl, { method: 'POST', body: JSON.stringify({ jobId: id, config: body }), headers: { 'content-type': 'application/json' }});
      if (!r.ok) throw new Error('Dispatch failed');
    } catch {
      return bad('Failed to dispatch background job', 502);
    }

    return json({ ok: true, jobId: id }, { headers: corsHeaders });
  }

  // Get job snapshot
  const jobMatch = path.match(/^\/jobs\/([a-z0-9]+)$/i);
  if (method === 'GET' && jobMatch) {
    const id = jobMatch[1];
    const state = await getState(id);
    if (!state) return bad('Job not found', 404);
    return json({ ok: true, job: state }, { headers: corsHeaders });
  }

  // Stream or poll events
  const evMatch = path.match(/^\/jobs\/([a-z0-9]+)\/events$/i);
  if (evMatch && method === 'GET') {
    const id = evMatch[1];
    const from = parseInt(url.searchParams.get('from') || '0', 10);
    const accept = (req.headers.get('accept') || '').toLowerCase();
    if (accept.includes('text/event-stream')) {
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const encoder = new TextEncoder();
      const write = (s: string) => writer.write(encoder.encode(s));

      // SSE headers
      const headers = { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', ...corsHeaders };
      const stream = new Response(readable, { headers });

      (async () => {
        let last = from;
        const endAt = Date.now() + Math.min(25000, REQUEST_TIMEOUT_MS - 1000);
        while (Date.now() < endAt) {
          const { events, last: newLast } = await listEventsAfter(id, last);
          for (const ev of events) {
            write(`event: ${ev.type}\n`);
            write(`data: ${JSON.stringify(ev)}\n\n`);
          }
          if (newLast > last) last = newLast;
          await new Promise(r => setTimeout(r, 1000));
        }
        write(`event: ping\ndata: {}\n\n`);
        await writer.close();
      })();

      return stream;
    } else {
      const data = await listEventsAfter(id, from);
      return json({ ok: true, ...data }, { headers: corsHeaders });
    }
  }


  // Job controls
  const ctrlPause = path.match(/^\/jobs\/([a-z0-9]+)\/pause$/i);
  if (method === 'POST' && ctrlPause) {
    const id = ctrlPause[1];
    const state = await getState(id);
    if (!state) return bad('Job not found', 404);
    state.status = 'paused';
    await putState(state);
    await appendEvent(id, { type: 'log', at: new Date().toISOString(), level: 'info', msg: 'Job paused' });
    return json({ ok: true }, { headers: corsHeaders });
  }
  const ctrlResume = path.match(/^\/jobs\/([a-z0-9]+)\/resume$/i);
  if (method === 'POST' && ctrlResume) {
    const id = ctrlResume[1];
    const state = await getState(id);
    if (!state) return bad('Job not found', 404);
    state.status = 'running';
    await putState(state);
    await appendEvent(id, { type: 'log', at: new Date().toISOString(), level: 'info', msg: 'Job resumed' });
    return json({ ok: true }, { headers: corsHeaders });
  }
  const ctrlStop = path.match(/^\/jobs\/([a-z0-9]+)\/stop$/i);
  if (method === 'POST' && ctrlStop) {
    const id = ctrlStop[1];
    const state = await getState(id);
    if (!state) return bad('Job not found', 404);
    state.status = 'stopped';
    state.finished_at = new Date().toISOString();
    await putState(state);
    await appendEvent(id, { type: 'log', at: new Date().toISOString(), level: 'info', msg: 'Job stopped' });
    await appendEvent(id, { type: 'done', at: new Date().toISOString(), items: state.items_emitted });
    return json({ ok: true }, { headers: corsHeaders });
  }

  return bad(`No route for ${method} ${path}`, 404);
};
