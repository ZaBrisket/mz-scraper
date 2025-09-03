import { getStore } from '@netlify/blobs';
import type { Event, Item, Job } from './types';

const STORE = 'mz-scraper';

function k(jobId: string, path: string) { return `jobs/${jobId}/${path}`; }

export async function putState(job: Job) {
  const store = getStore({ name: STORE });
  await store.setJSON(k(job.id, 'state.json'), job);
}

export async function getState(jobId: string): Promise<Job | null> {
  const store = getStore({ name: STORE });
  const j = await store.get(k(jobId, 'state.json'), { type: 'json' });
  return (j as any) || null;
}

export async function appendEvent(jobId: string, ev: Event): Promise<number> {
  const store = getStore({ name: STORE });
  // atomic-ish tail increment with last-write-wins: read tail, increment, write new
  const tailKey = k(jobId, 'tail.json');
  const indexKey = k(jobId, 'events/index.json');
  const current = (await store.get(tailKey, { type: 'json' })) as any || { tail: 0 };
  const next = (current.tail || 0) + 1;

  // update tail and write the event file
  await store.setJSON(tailKey, { tail: next });
  await store.setJSON(k(jobId, `events/${String(next).padStart(8,'0')}.json`), ev);

  // maintain an optional index of event ids
  const rawIndex = (await store.get(indexKey, { type: 'json' })) as any;
  const index: number[] = Array.isArray(rawIndex) ? rawIndex : (rawIndex?.ids || []);
  index.push(next);
  await store.setJSON(indexKey, index);

  return next;
}

export async function listEventsAfter(jobId: string, after: number): Promise<{ events: Event[]; last: number }> {
  const store = getStore({ name: STORE });
  const indexKey = k(jobId, 'events/index.json');
  const rawIndex = (await store.get(indexKey, { type: 'json' })) as any;

  // If an index exists, use it to avoid directory scans
  if (rawIndex) {
    const ids: number[] = Array.isArray(rawIndex) ? rawIndex : (rawIndex.ids || []);
    const last = ids.length ? ids[ids.length - 1] : 0;
    if (last <= after) return { events: [], last };
    const out: Event[] = [];
    for (const id of ids) {
      if (id > after) {
        const key = k(jobId, `events/${String(id).padStart(8,'0')}.json`);
        const ev = await store.get(key, { type: 'json' }) as any;
        if (ev) out.push(ev as Event);
      }
    }
    return { events: out, last };
  }

  // Fallback: scan directory if no index is present
  const tail = (await store.get(k(jobId, 'tail.json'), { type: 'json' })) as any || { tail: 0 };
  const last = tail.tail || 0;
  if (last <= after) return { events: [], last };
  const out: Event[] = [];
  const prefix = k(jobId, 'events/');
  const list = await store.list({ prefix });
  const files = (list.blobs || []).map(b => b.key).sort();
  for (const key of files) {
    const seq = parseInt(key.split('/').pop()!.replace('.json',''), 10);
    if (seq > after) {
      const ev = await store.get(key, { type: 'json' }) as any;
      if (ev) out.push(ev as Event);
    }
  }
  return { events: out, last };
}

export async function appendItem(jobId: string, item: Item): Promise<number> {
  const store = getStore({ name: STORE });
  const tailKey = k(jobId, 'items_tail.json');
  const current = (await store.get(tailKey, { type: 'json' })) as any || { tail: 0 };
  const next = (current.tail || 0) + 1;
  await store.setJSON(tailKey, { tail: next });
  await store.setJSON(k(jobId, `items/${String(next).padStart(8,'0')}.json`), item);
  return next;
}

export async function listItems(jobId: string): Promise<Item[]> {
  const store = getStore({ name: STORE });
  const prefix = k(jobId, 'items/');
  const list = await store.list({ prefix });
  const files = (list.blobs || []).map(b => b.key).sort();
  const out: Item[] = [];
  for (const key of files) {
    const v = await store.get(key, { type: 'json' }) as any;
    if (v) out.push(v as Item);
  }
  return out;
}


export async function putRaw(jobId: string, url: string, html: string) {
  const store = getStore({ name: STORE });
  const safe = url.replace(/[^a-z0-9]+/gi, '_').slice(0, 180);
  await store.set(`jobs/${jobId}/raw/${safe}.html`, html);
}
