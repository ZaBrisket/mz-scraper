import * as cheerio from 'cheerio';
const NEXT_TOKENS = ['next','older','›','»','→','more'];
export function detectNextUrl(baseUrl: string, html: string, hintText?: string): string | null {
  const $ = cheerio.load(html);
  const relNext = $('link[rel="next"]').attr('href') || $('a[rel="next"]').attr('href');
  if (relNext) return new URL(relNext, baseUrl).toString();
  let candidates: string[] = [];
  $('a,button').each((_, el) => {
    const t = ($(el).attr('aria-label') || $(el).attr('title') || $(el).text() || '').trim().toLowerCase();
    if (!t) return;
    const tokens = [ ...(hintText ? [hintText.toLowerCase()] : []), ...NEXT_TOKENS ];
    if (tokens.some(tok => t === tok || t.includes(tok))) {
      const href = $(el).attr('href');
      if (href) candidates.push(new URL(href, baseUrl).toString());
    }
  });
  if (candidates.length) return candidates[0];
  $('a[class],button[class]').each((_, el) => {
    const cls = ($(el).attr('class') || '').toLowerCase();
    if (/next|older|more/.test(cls)) {
      const href = $(el).attr('href');
      if (href) candidates.push(new URL(href, baseUrl).toString());
    }
  });
  return candidates[0] || null;
}
