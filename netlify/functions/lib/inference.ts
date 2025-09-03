import { preflightSelector, discoverSameOriginLinks, clusterPaths, inferLinkSelectorFromCluster } from './extract';
import { z } from 'zod';
import { assertUrlIsSafe } from './ssrf';
import { isAllowedByRobots } from './robots';

const Input = z.object({
  startUrl: z.string().url(),
  subPageExample: z.string().url().optional(),
  nextButtonText: z.string().optional()
});

export async function inferSelectors(body: unknown) {
  const { startUrl, subPageExample, nextButtonText } = Input.parse(body);
  await assertUrlIsSafe(startUrl);
  const allowed = await isAllowedByRobots(startUrl, process.env.USER_AGENT || 'mz-scraper/0.1');
  if (!allowed) throw new Error('Blocked by robots.txt');
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), parseInt(process.env.REQUEST_TIMEOUT_MS || '15000', 10));
  let res: Response;
  try {
    res = await fetch(startUrl, { redirect: 'follow', headers: { 'User-Agent': process.env.USER_AGENT || 'mz-scraper/0.1' }, signal: controller.signal });
  } catch {
    throw new Error('Failed to fetch start URL');
  } finally { clearTimeout(t); }
  if (!res.ok) throw new Error(`Fetch failed with status ${res.status}`);
  let html: string;
  try { html = await res.text(); } catch { throw new Error('Failed to read response'); }

  // Optional OpenAI path
  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey) {
    try {
      const { default: OpenAI } = await import('openai');
      const client = new OpenAI({ apiKey });
      const sys = 'Output strict JSON: {"linkSelector": "...", "nextButtonText": "..."} Conservative defaults if unsure.';
      const user = `Start URL: ${startUrl}\nExample: ${subPageExample || ''}\nHTML (truncated):\n` + html.slice(0, 20000);
      const chat = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
        temperature: 0,
        response_format: { type: 'json_object' }
      } as any);
      const content = chat.choices[0].message?.content || '{}';
      const parsed = JSON.parse(content);
      const linkSelector = String(parsed.linkSelector || 'a');
      const nextBtn = String(parsed.nextButtonText || nextButtonText || 'next');
      if (preflightSelector(html, linkSelector) > 0) return { linkSelector, nextButtonText: nextBtn };
    } catch {}
  }

  // Heuristics
  const so = discoverSameOriginLinks(startUrl, html);
  const clusters = clusterPaths(so);
  const best = clusters[0] || '';
  const linkSelector = inferLinkSelectorFromCluster(html, best);
  return { linkSelector, nextButtonText: nextButtonText || 'next' };
}
