import { JSDOM } from 'jsdom'

export function inferSelectors(html: string, url: string, sameOriginOnly = true): { linkSelector?: string, nextText?: string, notes: string[] } {
  const notes: string[] = []
  const dom = new JSDOM(html, { url })
  const doc = dom.window.document
  const anchors = Array.from(doc.querySelectorAll('a[href]')) as HTMLAnchorElement[]
  const origin = new URL(url).origin
  const inScope = anchors.filter(a => {
    const href = a.getAttribute('href') || ''
    if (!href || href.startsWith('#')) return false
    let abs: URL
    try { abs = new URL(href, url) } catch { return false }
    if (sameOriginOnly && abs.origin !== origin) return false
    // ignore nav/footer/headers
    const cls = (a.className || '').toString().toLowerCase()
    if (/nav|menu|footer|header|logo|subscribe|signin|login|social/.test(cls)) return false
    // prefer longer text and those inside article/main
    const path = a.closest('article, main, section, li, .post, .entry') ? 1 : 0
    const txt = (a.textContent || '').trim()
    const score = (txt.length >= 3 ? 1 : 0) + path
    ;(a as any)._score = score
    return true
  })
  // Find repeating class patterns
  const buckets = new Map<string, { els: Element[], score: number }>()
  for (const a of inScope) {
    const path = cssPath(a)
    const key = simplify(path)
    const b = buckets.get(key) || { els: [], score: 0 }
    b.els.push(a)
    b.score += (a as any)._score || 0
    buckets.set(key, b)
  }
  const ranked = Array.from(buckets.entries()).sort((a,b) => b[1].score - a[1].score)
  let selector: string | undefined
  if (ranked[0]?.[1]?.els?.length >= 3) {
    selector = ranked[0][0]
    notes.push(`Guessed link selector: ${selector} (count=${ranked[0][1].els.length})`)
  } else if (inScope.length > 0) {
    selector = 'article a, main a'
    notes.push('Fallback selector: article a, main a')
  }

  // Next text
  const next = anchors.find(a => /next|older|more|›|»/i.test((a.textContent||'')))
  const nextText = next ? (next.textContent||'Next').trim() : undefined
  if (nextText) notes.push(`Detected next button text: "${nextText}"`)

  return { linkSelector: selector, nextText, notes }
}

function cssPath(el: Element): string {
  const parts: string[] = []
  let node: Element | null = el
  while (node && parts.length < 5) {
    let part = node.tagName.toLowerCase()
    if (node.id) { part += `#${node.id}`; parts.unshift(part); break }
    const cls = node.getAttribute('class')?.trim().split(/\s+/).filter(Boolean).slice(0,2).join('.')
    if (cls) part += '.' + cls.replace(/\./g, '.')
    const parent = node.parentElement
    if (parent) {
      const sameTag = Array.from(parent.children).filter(c => (c as Element).tagName === node!.tagName)
      if (sameTag.length > 1) {
        const idx = sameTag.indexOf(node) + 1
        part += `:nth-of-type(${idx})`
      }
    }
    parts.unshift(part)
    node = parent
  }
  return parts.join(' > ')
}

function simplify(sel: string) {
  return sel
    .replace(/:nth-of-type\(\d+\)/g, '')
    .replace(/\s+>/g, ' > ')
}