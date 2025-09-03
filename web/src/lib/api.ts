const API_BASE = '/api';

async function parseJson(r: Response) {
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  try { return await r.json(); } catch { throw new Error('Invalid JSON'); }
}

export interface StartJobPayload {
  urls: string[];
  baseDelayMs?: number;
}

export async function startJob(payload: StartJobPayload) {
  try {
    const r = await fetch(API_BASE + '/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return await parseJson(r);
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }
}

export async function getJob(id: string) {
  try {
    const r = await fetch(API_BASE + `/jobs/${id}`);
    return await parseJson(r);
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }
}

export function streamEvents(jobId: string, from: number, onEvent: (type: string, data: any) => void, onEnd: ()=>void, onError: ()=>void) {
  // Try SSE first
  const url = API_BASE + `/jobs/${jobId}/events?from=${from}`;
  let es: EventSource | null = null;
  try {
    es = new EventSource(url);
    es.addEventListener('log', (e) => onEvent('log', JSON.parse((e as MessageEvent).data)));
    es.addEventListener('item', (e) => onEvent('item', JSON.parse((e as MessageEvent).data)));
    es.addEventListener('done', (e) => onEvent('done', JSON.parse((e as MessageEvent).data)));
    es.addEventListener('error', () => { es?.close(); onError(); });
  } catch {
    onError();
  }
  return () => { es?.close(); onEnd(); };
}

export async function pollEvents(jobId: string, from: number) {
  try {
    const r = await fetch(API_BASE + `/jobs/${jobId}/events?from=${from}`, { headers: { 'Accept': 'application/json' } });
    return await parseJson(r);
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }
}
