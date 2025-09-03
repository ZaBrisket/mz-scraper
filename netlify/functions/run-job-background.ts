import type { Context } from "@netlify/functions";
import { z } from 'zod';
import { getState, putState, appendEvent, appendItem, putRaw } from './lib/blobs';
import { preflightSelector, discoverSameOriginLinks } from './lib/extract';
import { detectNextUrl } from './lib/paginate';
import { extractMainContent } from './lib/readability';
import { normalizeUrl, sameOrigin } from './lib/url';
import { isAllowedByRobots } from './lib/robots';
import { assertUrlIsSafe } from './lib/ssrf';

const USER_AGENT = process.env.USER_AGENT || 'mz-scraper/0.1 (+https://brisketscraper.com)';
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || '3', 10);
const REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS || '15000', 10);
const BASE_DELAY_MS = parseInt(process.env.BASE_DELAY_MS || '1000', 10);
const ALLOW_RAW_HTML = /^true$/i.test(process.env.ALLOW_RAW_HTML || 'false');
const CIRCUIT_BREAK_LIMIT = parseInt(process.env.CIRCUIT_BREAK_LIMIT || '3', 10);
const MAX_QUEUE = parseInt(process.env.MAX_QUEUE || '5000', 10);
const VISITED_PERSIST_LIMIT = parseInt(process.env.VISITED_PERSIST_LIMIT || '1000', 10);

const StartInput = z.object({
  startUrl: z.string().url(),
  subPageExample: z.string().url().optional(),
  nextButtonText: z.string().optional(),
  linkSelector: z.string().optional(),
  sameOriginOnly: z.boolean().default(true),
  maxPages: z.number().int().min(1).max(500).default(50),
  baseDelayMs: z.number().int().min(0).max(10000).default(BASE_DELAY_MS)
});

const UrlListInput = z.object({
  urls: z.array(z.string().url()).min(1),
  baseDelayMs: z.number().int().min(0).max(10000).default(BASE_DELAY_MS)
});

type StartCfg = z.infer<typeof StartInput>;
type UrlListCfg = z.infer<typeof UrlListInput>;
type Cfg = StartCfg | UrlListCfg;

async function fetchWithRetry(url: string, maxRetries: number, baseDelay: number): Promise<{ ok: boolean; status: number; html: string }> {
  let attempt = 0;
  while (true) {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      const r = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, redirect: 'follow', signal: controller.signal });
      clearTimeout(t);
      const html = await r.text();
      if (r.ok) return { ok: true, status: r.status, html };
      if ((r.status === 429 || r.status >= 500) && attempt < maxRetries) {
        attempt++;
        const backoff = Math.min(30000, Math.round((2 ** attempt) * baseDelay + Math.random() * baseDelay));
        await new Promise(res => setTimeout(res, backoff));
        continue;
      }
      return { ok: false, status: r.status, html };
    } catch {
      if (attempt < maxRetries) {
        attempt++;
        const backoff = Math.min(30000, Math.round((2 ** attempt) * baseDelay + Math.random() * baseDelay));
        await new Promise(res => setTimeout(res, backoff));
        continue;
      }
      return { ok: false, status: 0, html: '' };
    }
  }
}

export default async (req: Request, context: Context) => {
  if (req.method !== 'POST') return new Response(null, { status: 405 });
  let payload: any = {};
  try { payload = await req.json(); } catch {}
  const jobId = String(payload.jobId || '');
  const Input = z.union([StartInput, UrlListInput]);
  const cfg: Cfg = Input.parse(payload.config);

  const isUrlList = Array.isArray((cfg as any).urls);

  let state = await getState(jobId);
  if (!state) return new Response(null, { status: 404 });
  state.status = 'running';
  await putState(state);

  const modeTag = isUrlList ? '[url-list]' : '[crawl]';
  const log = (msg: string, level?: 'info' | 'warn') =>
    appendEvent(jobId, { type: 'log', at: new Date().toISOString(), level, msg: `${modeTag} ${msg}` });

  try {
    await log(`Job ${jobId} started`);

  const initial = [...new Set(isUrlList ? (cfg as UrlListCfg).urls.map(normalizeUrl) : [normalizeUrl((cfg as StartCfg).startUrl)])];
  const queue: string[] = [...initial];
  const queued = new Set<string>(queue);
  const visited = new Set<string>((state as any).visited || []);
  let linkSelector = !isUrlList ? ((cfg as StartCfg).linkSelector || 'a') : 'a';
  const nextButtonText = !isUrlList ? ((cfg as StartCfg).nextButtonText || 'next') : 'next';
  let matchesOk = 0, matchesTotal = 0;
  const hostFailures = new Map<string, number>();

  const baseDelay = cfg.baseDelayMs;
  const maxPages = !isUrlList ? (cfg as StartCfg).maxPages : queue.length;

  while (queue.length && visited.size < maxPages) {
    // Check controls
    state = await getState(jobId);
    if (state?.status === 'stopped') break;
    while (state?.status === 'paused') { await new Promise(r => setTimeout(r, 750)); state = await getState(jobId); }
    const url = queue.shift()!;
    queued.delete(url);
    if (visited.has(url)) continue;
    visited.add(url);
    const host = new URL(url).host;
    const failCount = hostFailures.get(host) || 0;
    if (failCount >= CIRCUIT_BREAK_LIMIT) {
      await log(`Circuit open for host ${host}; skipping ${url}`, 'warn');
      continue;
    }

    // robots + SSRF
    try { await assertUrlIsSafe(url); } catch { await log(`Blocked by SSRF guard: ${url}`, 'warn'); continue; }
    const allowed = await isAllowedByRobots(url, USER_AGENT);
    if (!allowed) { await log(`robots.txt disallows: ${url}`, 'warn'); continue; }

    // polite throttle per host
    const jitter = Math.floor(Math.random() * baseDelay * 0.3);
    await new Promise(r => setTimeout(r, baseDelay + jitter));

    const start = Date.now();
    const r = await fetchWithRetry(url, MAX_RETRIES, baseDelay);

    if (ALLOW_RAW_HTML && r.html) { try { await putRaw(jobId, url, r.html); } catch {} }

    if (!r.ok) {
      const count = (hostFailures.get(host) || 0) + 1;
      hostFailures.set(host, count);
      await log(`Fetch failed (${r.status}) for ${url}`, 'warn');
      if (count >= 3) { await log(`Circuit open for host ${host}`, 'warn'); }
      continue;
    } else {
      hostFailures.set(host, 0);
    }

    if (!isUrlList) {
      // Preflight selector
      const count = preflightSelector(r.html, linkSelector);
      matchesTotal++;
      if (count > 0) matchesOk++; else {
        const linksSO = discoverSameOriginLinks(url, r.html);
        if (linksSO.length) {
          const cluster = linksSO.map(u => new URL(u).pathname.split('/').filter(Boolean).slice(0,2).join('/')).sort()[0] || '';
          const inferredSelector = cluster ? `a[href^="/${cluster}"]` : 'a';
          linkSelector = inferredSelector;
          await log(`Preflight zero matches; fell back to ${linkSelector}`, 'warn');
        }
      }

      // Extract item & emit
      const item = { job_id: jobId, url, ...extractMainContent(url, r.html) };
      await appendItem(jobId, item as any);
      await appendEvent(jobId, { type: 'item', at: new Date().toISOString(), item } as any);

      // Enqueue links
      const { load } = await import('cheerio');
      const $ = load(r.html);
      $(linkSelector).each((_, a) => {
        const href = $(a).attr('href'); if (!href) return;
        try {
          const nxt = normalizeUrl(new URL(href, url).toString());
          const ok = (cfg as StartCfg).sameOriginOnly ? sameOrigin(nxt, (cfg as StartCfg).startUrl) : true;
          if (ok && !visited.has(nxt) && !queued.has(nxt)) {
            if (queue.length >= MAX_QUEUE) {
              log(`Queue limit reached; dropping ${nxt}`, 'warn');
            } else {
              queue.push(nxt); queued.add(nxt);
            }
          }
        } catch {}
      });
      // Pagination
      const nextUrl = detectNextUrl(url, r.html, nextButtonText);
      if (nextUrl) {
        const nurl = normalizeUrl(nextUrl);
        if (!visited.has(nurl) && !queued.has(nurl)) {
          if (queue.length >= MAX_QUEUE) {
            await log(`Queue limit reached; dropping ${nurl}`, 'warn');
          } else {
            queue.push(nurl); queued.add(nurl);
          }
        }
      }
    } else {
      // URL list mode: just extract item
      const item = { job_id: jobId, url, ...extractMainContent(url, r.html) };
      await appendItem(jobId, item as any);
      await appendEvent(jobId, { type: 'item', at: new Date().toISOString(), item } as any);
    }

    // Update state
    state = await getState(jobId);
    if (!state) break;
    state.pages_seen += 1;
    state.items_emitted += 1;
    const visitArr = Array.from(visited);
    let toPersist = visitArr;
    if (visitArr.length > VISITED_PERSIST_LIMIT) {
      toPersist = visitArr.slice(-VISITED_PERSIST_LIMIT);
      visited.clear();
      for (const u of toPersist) visited.add(u);
    }
    (state as any).visited = toPersist;
    await putState(state);
  }

  if (matchesTotal) {
    const matchRate = matchesOk / matchesTotal;
    await log(`Match rate: ${Math.round(matchRate*100)}%`);
  }
  state = await getState(jobId);
  if (state) { state.status = 'finished'; state.finished_at = new Date().toISOString(); await putState(state); }
  await appendEvent(jobId, { type: 'done', at: new Date().toISOString(), items: state?.items_emitted || 0 });

  return new Response(null, { status: 202 });
  } catch (err: any) {
    const job = await getState(jobId);
    if (job) {
      job.status = 'error';
      job.finished_at = new Date().toISOString();
      await putState(job);
    }
    const message = err instanceof Error ? err.message : String(err);
    await appendEvent(jobId, { type: 'log', at: new Date().toISOString(), level: 'error', msg: message });
    return new Response(null, { status: 500 });
  }
};
