export function normalizeUrl(input: string): string {
  try {
    const u = new URL(input);
    u.hash = '';
    const params = u.searchParams;
    [...params.keys()].forEach((k) => {
      if (/^utm_/i.test(k) || k === 'fbclid') params.delete(k);
    });
    const s = params.toString();
    u.search = s ? `?${s}` : '';
    if ((u.protocol === 'http:' && u.port === '80') || (u.protocol === 'https:' && u.port === '443')) u.port = '';
    if (u.pathname !== '/' && u.pathname.endsWith('/')) u.pathname = u.pathname.slice(0, -1);
    return u.toString();
  } catch {
    return input;
  }
}
export function sameOrigin(a: string, b: string): boolean {
  try { return new URL(a).origin === new URL(b).origin; } catch { return false; }
}
