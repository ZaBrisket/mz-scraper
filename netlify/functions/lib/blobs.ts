import { getStore } from '@netlify/blobs';
import type { Event, Item, Job } from './types';

const STORE = 'mz-scraper';

function k(jobId: string, path: string) { return `jobs/${jobId}/${path}`; }

// simple retry helper with exponential backoff
async function withRetry<T>(fn: () => Promise<T>, retries = 3, base = 200): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= retries) {
        console.error('withRetry failed after retries', err);
        throw err;
      }
      const delay = Math.min(5000, base * 2 ** attempt);
      await new Promise(res => setTimeout(res, delay));
    }
  }
}

export async function putState(job: Job) {
  const store = getStore({ name: STORE });
  await withRetry(() => store.setJSON(k(job.id, 'state.json'), job));
}

export async function getState(jobId: string): Promise<Job | null> {
  const store = getStore({ name: STORE });
  const j = await withRetry(() => store.get(k(jobId, 'state.json'), { type: 'json' }));
  return (j as any) || null;
}

export async function appendEvent(jobId: string, ev: Event): Promise<number> {
  const store = getStore({ name: STORE });
  // atomic-ish tail increment with last-write-wins: read tail, increment, write new
  const tailKey = k(jobId, 'tail.json');
  const current = (await withRetry(() => store.get(tailKey, { type: 'json' }))) as any || { tail: 0 };
  const next = (current.tail || 0) + 1;
  await withRetry(() => store.setJSON(tailKey, { tail: next }));
  await withRetry(() => store.setJSON(k(jobId, `events/${String(next).padStart(8,'0')}.json`), ev));
  return next;
}

export async function listEventsAfter(jobId: string, after: number): Promise<{ events: Event[]; last: number }> {
  const store = getStore({ name: STORE });
  const tail = (await withRetry(() => store.get(k(jobId, 'tail.json'), { type: 'json' }))) as any || { tail: 0 };
  const last = tail.tail || 0;
  if (last <= after) return { events: [], last };
  const out: Event[] = [];
  // list supports prefix; pull in batches
  const prefix = k(jobId, 'events/');
  const list = await withRetry(() => store.list({ prefix }));
  const files = (list.blobs || []).map(b => b.key).sort();
  for (const key of files) {
    const seq = parseInt(key.split('/').pop()!.replace('.json',''), 10);
    if (seq > after) {
      const ev = await withRetry(() => store.get(key, { type: 'json' })) as any;
      if (ev) out.push(ev as Event);
    }
  }
  return { events: out, last };
}

export async function appendItem(jobId: string, item: Item): Promise<number> {
  const store = getStore({ name: STORE });
  const tailKey = k(jobId, 'items_tail.json');
  const current = (await withRetry(() => store.get(tailKey, { type: 'json' }))) as any || { tail: 0 };
  const next = (current.tail || 0) + 1;
  await withRetry(() => store.setJSON(tailKey, { tail: next }));
  await withRetry(() => store.setJSON(k(jobId, `items/${String(next).padStart(8,'0')}.json`), item));
  return next;
}

export async function listItems(jobId: string): Promise<Item[]> {
  const store = getStore({ name: STORE });
  const prefix = k(jobId, 'items/');
  const list = await withRetry(() => store.list({ prefix }));
  const files = (list.blobs || []).map(b => b.key).sort();
  const out: Item[] = [];
  for (const key of files) {
    const v = await withRetry(() => store.get(key, { type: 'json' })) as any;
    if (v) out.push(v as Item);
  }
  return out;
}


export async function putRaw(jobId: string, url: string, html: string) {
  const store = getStore({ name: STORE });
  const safe = url.replace(/[^a-z0-9]+/gi, '_').slice(0, 180);
  await withRetry(() => store.set(`jobs/${jobId}/raw/${safe}.html`, html));
}
