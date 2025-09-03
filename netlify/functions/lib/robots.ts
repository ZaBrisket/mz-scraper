interface CacheEntry<T> { value: T; expires: number }
const ROBOTS_CACHE = new Map<string, CacheEntry<string>>();
const ROBOTS_CACHE_TTL_MS = parseInt(process.env.ROBOTS_CACHE_TTL_MS || '3600000', 10);
const ROBOTS_CACHE_MAX = parseInt(process.env.ROBOTS_CACHE_MAX || '100', 10);
const REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS || '15000', 10);
const ROBOTS_FETCH_RETRIES = parseInt(process.env.ROBOTS_FETCH_RETRIES || '3', 10);

function purgeExpired<T>(cache: Map<string, CacheEntry<T>>, now: number): void {
  for (const [k, v] of cache) if (v.expires <= now) cache.delete(k);
}

async function fetchWithRetry(url: string, init: RequestInit, retries = ROBOTS_FETCH_RETRIES): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < retries; i++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(t);
      return res;
    } catch (err) {
      clearTimeout(t);
      lastErr = err;
      if (i === retries - 1) throw err;
    }
  }
  throw lastErr as Error;
}

export async function isAllowedByRobots(url: string, userAgent: string): Promise<boolean> {
  try {
    const u = new URL(url);
    const robotsUrl = `${u.origin}/robots.txt`;
    const now = Date.now();
    purgeExpired(ROBOTS_CACHE, now);
    let text = ROBOTS_CACHE.get(robotsUrl)?.value;
    if (!text) {
      const res = await fetchWithRetry(robotsUrl, { redirect: 'follow', headers: { 'User-Agent': userAgent } });
      if (!res.ok) return true;
      text = await res.text();
      if (ROBOTS_CACHE.size >= ROBOTS_CACHE_MAX) ROBOTS_CACHE.delete(ROBOTS_CACHE.keys().next().value);
      ROBOTS_CACHE.set(robotsUrl, { value: text, expires: now + ROBOTS_CACHE_TTL_MS });
    }
    return parseRobots(text, userAgent, u.pathname);
  } catch {
    return true;
  }
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
