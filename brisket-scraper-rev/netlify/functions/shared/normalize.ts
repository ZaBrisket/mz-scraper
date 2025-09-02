import { JSDOM } from 'jsdom'
import createDOMPurify from 'dompurify'
import { Readability } from '@mozilla/readability'

export type ExtractResult = {
  title?: string
  byline?: string | null
  published?: string | null
  content_text: string
  content_html?: string
}

export function extractMainContent(html: string, url: string): ExtractResult {
  const dom = new JSDOM(html, { url })
  // Clone to avoid mutations by Readability
  const clone = new JSDOM(dom.serialize(), { url })
  const doc = clone.window.document
  const reader = new Readability(doc)
  const article = reader.parse()
  let content_text = ''
  let content_html: string | undefined
  let title: string | undefined
  let byline: string | null | undefined
  let published: string | null | undefined
  if (article) {
    title = article.title || undefined
    byline = (article as any).byline ?? null
    published = (article as any).publishedTime ?? null
    content_text = article.textContent || ''
    // sanitize HTML
    const purify = createDOMPurify(new JSDOM('').window as any)
    content_html = purify.sanitize(article.content || '', { USE_PROFILES: { html: true } }) || undefined
  }
  return { title, byline, published, content_text, content_html }
}