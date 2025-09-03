export async function isAllowedByRobots(url: string, userAgent: string): Promise<boolean> {
  try {
    const u = new URL(url);
    const robotsUrl = `${u.origin}/robots.txt`;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), parseInt(process.env.REQUEST_TIMEOUT_MS || '15000', 10));
    const res = await fetch(robotsUrl, { redirect: 'follow', headers: { 'User-Agent': userAgent }, signal: controller.signal });
    clearTimeout(t);
    if (!res.ok) return true;
    const text = await res.text();
    return parseRobots(text, userAgent, u.pathname);
  } catch { return true; }
}
function parseRobots(content: string, ua: string, path: string): boolean {
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
