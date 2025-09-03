import { preflightSelector, discoverSameOriginLinks, clusterPaths, inferLinkSelectorFromCluster } from './extract';
import { z } from 'zod';
import { assertUrlIsSafe } from './ssrf';
import { isAllowedByRobots } from './robots';

const USER_AGENT = process.env.USER_AGENT || 'mz-scraper/0.1 (+https://brisketscraper.com)';
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || '3', 10);
const REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS || '15000', 10);
const BASE_DELAY_MS = parseInt(process.env.BASE_DELAY_MS || '1000', 10);

export async function fetchWithRetry(url: string, init: RequestInit = {}, maxRetries = MAX_RETRIES, baseDelay = BASE_DELAY_MS): Promise<Response> {
  let attempt = 0;
  while (true) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(t);
      if (res.ok || attempt >= maxRetries || (res.status !== 429 && res.status < 500)) return res;
    } catch (e) {
      clearTimeout(t);
      if (attempt >= maxRetries) throw e;
    }
    attempt++;
    const backoff = Math.min(30000, Math.round((2 ** attempt) * baseDelay + Math.random() * baseDelay));
    await new Promise(r => setTimeout(r, backoff));
  }
}

const Input = z.object({
  startUrl: z.string().url(),
  subPageExample: z.string().url().optional(),
  nextButtonText: z.string().optional()
});

export async function inferSelectors(body: unknown) {
  const { startUrl, subPageExample, nextButtonText } = Input.parse(body);
  await assertUrlIsSafe(startUrl);
  const allowed = await isAllowedByRobots(startUrl, USER_AGENT);
  if (!allowed) throw new Error('Blocked by robots.txt');
  let res: Response;
  try {
    res = await fetchWithRetry(startUrl, { redirect: 'follow', headers: { 'User-Agent': USER_AGENT } });
  } catch {
    throw new Error('Failed to fetch start URL');
  }
  if (!res.ok) throw new Error(`Fetch failed with status ${res.status}`);
  let html: string;
  try { html = await res.text(); } catch { throw new Error('Failed to read response'); }

  // Optional OpenAI path
  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey) {
    try {
      const sys = 'Output strict JSON: {"linkSelector": "...", "nextButtonText": "..."} Conservative defaults if unsure.';
      const user = `Start URL: ${startUrl}\nExample: ${subPageExample || ''}\nHTML (truncated):\n` + html.slice(0, 20000);
      const payload = {
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
        temperature: 0,
        response_format: { type: 'json_object' }
      };
      const r = await fetchWithRetry('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload)
      });
      if (r.ok) {
        const chat = await r.json();
        const content = chat?.choices?.[0]?.message?.content || '{}';
        const parsed = JSON.parse(content);
        const linkSelector = String(parsed.linkSelector || 'a');
        const nextBtn = String(parsed.nextButtonText || nextButtonText || 'next');
        if (preflightSelector(html, linkSelector) > 0) return { linkSelector, nextButtonText: nextBtn };
      }
    } catch {}
  }

  // Heuristics
  const so = discoverSameOriginLinks(startUrl, html);
  const clusters = clusterPaths(so);
  const best = clusters[0] || '';
  const linkSelector = inferLinkSelectorFromCluster(html, best);
  return { linkSelector, nextButtonText: nextButtonText || 'next' };
}
