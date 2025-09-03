const cache = new Map<string, string | null>();

export async function isAllowedByRobots(url: string, userAgent: string): Promise<boolean> {
  try {
    const u = new URL(url);
    let text = cache.get(u.origin);
    if (text === undefined) {
      const robotsUrl = `${u.origin}/robots.txt`;
      const res = await fetch(robotsUrl, { redirect: 'follow', headers: { 'User-Agent': userAgent } });
      if (!res.ok) { cache.set(u.origin, null); return true; }
      text = await res.text();
      cache.set(u.origin, text);
    }
    if (text === null) return true;
    return parseRobots(text, userAgent, u.pathname);
  } catch { return true; }
}
export function parseRobots(content: string, ua: string, path: string): boolean {
  const lines = content.split(/\r?\n/);
  let applies = false, allowed = true;
  const uaLower = ua.toLowerCase();
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [k, vRaw] = line.split(':', 2);
    const key = k?.trim().toLowerCase();
    const val = vRaw?.trim() || '';
    if (key === 'user-agent') {
      const matchAny = val === '*';
      const matchExact = val && uaLower.includes(val.toLowerCase());
      applies = matchAny || matchExact;
    } else if (applies && key === 'disallow') {
      if (val && path.startsWith(val)) allowed = false;
    } else if (applies && key === 'allow') {
      if (val && path.startsWith(val)) allowed = true;
    }
  }
  return allowed;
}
