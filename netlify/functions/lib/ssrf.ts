import dns from 'node:dns/promises';
import net from 'node:net';
import type { LookupAddress } from 'node:dns';

const PRIVATE_V4 = [
  ['10.0.0.0', '10.255.255.255'],
  ['172.16.0.0', '172.31.255.255'],
  ['192.168.0.0', '192.168.255.255'],
  ['127.0.0.0', '127.255.255.255'],
  ['169.254.0.0', '169.254.255.255']
];
function ipToInt(ip: string): number { return ip.split('.').reduce((a,o)=>(a<<8)+parseInt(o,10),0)>>>0; }
function inRange(ip: string, s: string, e: string): boolean { const I=ipToInt(ip), S=ipToInt(s), E=ipToInt(e); return I>=S && I<=E; }
function isPrivateV4(ip: string): boolean { return PRIVATE_V4.some(([s,e])=>inRange(ip,s,e)); }
function isPrivateV6(addr: string): boolean {
  const x = addr.toLowerCase();
  return x==='::1' || x.startsWith('fe80:') || x.startsWith('fc') || x.startsWith('fd');
}

interface CacheEntry<T> { value: T; expires: number }
const DNS_CACHE = new Map<string, CacheEntry<LookupAddress[]>>();
const DNS_CACHE_TTL_MS = parseInt(process.env.DNS_CACHE_TTL_MS || '3600000', 10);
const DNS_CACHE_MAX = parseInt(process.env.DNS_CACHE_MAX || '100', 10);
const DNS_TIMEOUT_MS = parseInt(process.env.DNS_TIMEOUT_MS || '5000', 10);
const DNS_LOOKUP_RETRIES = parseInt(process.env.DNS_LOOKUP_RETRIES || '3', 10);

function purgeExpired<T>(cache: Map<string, CacheEntry<T>>, now: number): void {
  for (const [k, v] of cache) if (v.expires <= now) cache.delete(k);
}

async function lookupWithRetry(host: string): Promise<LookupAddress[]> {
  let lastErr: unknown;
  for (let i = 0; i < DNS_LOOKUP_RETRIES; i++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), DNS_TIMEOUT_MS);
    try {
      const res = await dns.lookup(host, { all: true, signal: controller.signal });
      clearTimeout(t);
      return res;
    } catch (err) {
      clearTimeout(t);
      lastErr = err;
      if (i === DNS_LOOKUP_RETRIES - 1) throw err;
    }
  }
  throw lastErr as Error;
}

export async function assertUrlIsSafe(input: string): Promise<void> {
  let u: URL;
  try { u = new URL(input); } catch { throw new Error('Invalid URL'); }
  if (!/^https?:$/.test(u.protocol)) throw new Error('Protocol not allowed');
  if (u.username || u.password) throw new Error('Credentials in URL not allowed');
  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local')) throw new Error('Local host blocked');

  const now = Date.now();
  purgeExpired(DNS_CACHE, now);
  let recs = DNS_CACHE.get(host)?.value;
  if (!recs) {
    recs = await lookupWithRetry(host);
    if (DNS_CACHE.size >= DNS_CACHE_MAX) DNS_CACHE.delete(DNS_CACHE.keys().next().value);
    DNS_CACHE.set(host, { value: recs, expires: now + DNS_CACHE_TTL_MS });
  }
  for (const r of recs) {
    if (net.isIP(r.address) === 4 && isPrivateV4(r.address)) throw new Error('Private IPv4 blocked');
    if (net.isIP(r.address) === 6 && isPrivateV6(r.address)) throw new Error('Private IPv6 blocked');
  }
}
