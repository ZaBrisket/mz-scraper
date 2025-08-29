import dns from 'node:dns/promises';
import net from 'node:net';

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

export async function assertUrlIsSafe(input: string): Promise<void> {
  let u: URL;
  try { u = new URL(input); } catch { throw new Error('Invalid URL'); }
  if (!/^https?:$/.test(u.protocol)) throw new Error('Protocol not allowed');
  if (u.username || u.password) throw new Error('Credentials in URL not allowed');
  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local')) throw new Error('Local host blocked');

  const recs = await dns.lookup(host, { all: true });
  for (const r of recs) {
    if (net.isIP(r.address) === 4 && isPrivateV4(r.address)) throw new Error('Private IPv4 blocked');
    if (net.isIP(r.address) === 6 && isPrivateV6(r.address)) throw new Error('Private IPv6 blocked');
  }
}
