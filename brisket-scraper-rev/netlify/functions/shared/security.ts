const PRIVATE_CIDR = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^192\.168\./,
  /^0\./,
  /^::1$/,
  /^fc00:/,
  /^fe80:/
]

export function validateUrlOrThrow(raw: string) {
  let u: URL
  try { u = new URL(raw) } catch { throw new Error('Invalid URL') }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Only http/https are allowed')
  // Block obvious SSRF hosts
  const host = u.hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('Blocked host')
  }
  // Simple IP checks
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    if (PRIVATE_CIDR.some(re => re.test(host))) throw new Error('Blocked private IP')
  }
  return u
}

export function sameOriginFilter(urls: string[], origin: string) {
  return urls.filter(u => {
    try { return new URL(u).origin === origin } catch { return false }
  })
}

export function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}