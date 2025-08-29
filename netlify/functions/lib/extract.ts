import * as cheerio from 'cheerio';

export function preflightSelector(html: string, selector: string): number {
  const $ = cheerio.load(html);
  return $(selector).length;
}
export function discoverSameOriginLinks(baseUrl: string, html: string): string[] {
  const $ = cheerio.load(html);
  const base = new URL(baseUrl);
  const links = new Set<string>();
  $('a[href]').each((_, a) => {
    const href = $(a).attr('href')!;
    try {
      const url = new URL(href, baseUrl);
      if (url.origin === base.origin) links.add(url.toString());
    } catch {}
  });
  return [...links];
}
export function clusterPaths(urls: string[]): string[] {
  const counts = new Map<string, number>();
  for (const u of urls) {
    try {
      const p = new URL(u).pathname.split('/').filter(Boolean).slice(0,2).join('/');
      const key = p || '/';
      counts.set(key, (counts.get(key) || 0) + 1);
    } catch {}
  }
  return [...counts.entries()].sort((a,b)=>b[1]-a[1]).map(([k])=>k);
}
export function inferLinkSelectorFromCluster(html: string, cluster: string): string {
  const $ = cheerio.load(html);
  const selector = `a[href^="/${cluster}"]`;
  const count = $(selector).length;
  return count > 0 ? selector : 'a';
}
