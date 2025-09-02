export function findNextUrl(html: string, baseUrl: string, nextText?: string): string | null {
  // light-weight scan for rel=next or link text including nextText
  const relNext = html.match(/<a[^>]+rel=["']?next["']?[^>]*href=["']([^"']+)["']/i)
  if (relNext) {
    try { return new URL(relNext[1], baseUrl).toString() } catch {}
  }
  if (nextText) {
    const re = new RegExp(`<a[^>]*href=["']([^"']+)["'][^>]*>[^<]*${escapeRegex(nextText)}[^<]*</a>`, 'i')
    const m = html.match(re)
    if (m) { try { return new URL(m[1], baseUrl).toString() } catch {} }
  }
  // fallback heuristic: look for "Next"
  const m2 = html.match(/<a[^>]*href=["']([^"']+)["'][^>]*>(?:\s*Next\b|\bOlder\b|›|»)[^<]*</i)
  if (m2) { try { return new URL(m2[1], baseUrl).toString() } catch {} }
  return null
}
function escapeRegex(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }