import { parse as parseContentType } from 'content-type'
import * as iconv from 'iconv-lite'
import sniffHTMLEncoding from 'html-encoding-sniffer'

export async function decodeResponse(res: Response): Promise<{ html: string, encoding: string }> {
  // Try to detect encoding from headers, else sniff from first bytes
  const buf = new Uint8Array(await res.arrayBuffer())
  let encoding = 'utf-8'
  const ct = res.headers.get('content-type') || undefined
  let transport: string | undefined
  try {
    if (ct) {
      const parsed = parseContentType(ct)
      transport = parsed.parameters?.charset
    }
  } catch {}
  encoding = sniffHTMLEncoding(buf, { transportLayerEncodingLabel: transport || undefined }) || 'utf-8'
  let html: string
  if (/utf-?8/i.test(encoding)) {
    html = new TextDecoder('utf-8', { fatal: false }).decode(buf)
  } else {
    try {
      html = iconv.decode(Buffer.from(buf), encoding)
    } catch {
      html = new TextDecoder('utf-8', { fatal: false }).decode(buf)
      encoding = 'utf-8'
    }
  }
  return { html, encoding }
}