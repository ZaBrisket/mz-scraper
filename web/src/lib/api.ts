const API_BASE = '/api';

export async function inferSchema(payload: any) {
  const r = await fetch(API_BASE + '/schema', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return r.json();
}

export async function startJob(payload: any) {
  const r = await fetch(API_BASE + '/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return r.json();
}

export async function getJob(id: string) {
  const r = await fetch(API_BASE + `/jobs/${id}`);
  return r.json();
}

export function streamEvents(
  jobId: string,
  from: number,
  onEvent: (type: string, data: any) => void,
  onOpen: () => void,
  onEnd: () => void,
  onError: () => void
) {
  const url = API_BASE + `/jobs/${jobId}/events?from=${from}`;
  let es: EventSource | null = null;
  try {
    es = new EventSource(url);
    es.onopen = onOpen;
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
  const r = await fetch(API_BASE + `/jobs/${jobId}/events?from=${from}`, { headers: { 'Accept': 'application/json' } });
  return r.json();
}
