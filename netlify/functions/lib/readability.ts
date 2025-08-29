import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
export function extractMainContent(url: string, html: string) {
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  const title = article?.title || dom.window.document.querySelector('title')?.textContent || '';
  const text = article?.textContent || '';
  const byline = article?.byline || undefined;
  const excerpt = article?.excerpt || undefined;
  const meta = dom.window.document;
  const published =
    meta.querySelector('meta[property="article:published_time"]')?.getAttribute('content') ||
    meta.querySelector('meta[name="date"]')?.getAttribute('content') ||
    undefined;
  return { title, text, author: byline, description: excerpt, published_at: published };
}
