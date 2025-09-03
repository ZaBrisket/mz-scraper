import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';
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
  const ts = Date.now();
  const id = `${ts}-${crypto.randomUUID()}`;
  await store.setJSON(k(jobId, `events/${id}.json`), ev);
  // structured log for easier debugging
  try { console.log(JSON.stringify({ jobId, ...ev })); } catch {}
  return ts;
}

export async function listEventsAfter(jobId: string, after: number): Promise<{ events: Event[]; last: number }> {
  const store = getStore({ name: STORE });
  const prefix = k(jobId, 'events/');
  const list = await store.list({ prefix });
  const files = (list.blobs || []).map(b => b.key).sort();
  const out: Event[] = [];
  let last = after;
  for (const key of files) {
    const fname = key.split('/').pop()!.replace('.json','');
    const seq = parseInt(fname.split('-')[0], 10);
    if (Number.isNaN(seq)) continue;
    if (seq > after) {
      const ev = await store.get(key, { type: 'json' }) as any;
      if (ev) out.push(ev as Event);
    }
    if (seq > last) last = seq;
  }
  return { events: out, last };
}

export async function appendItem(jobId: string, item: Item): Promise<number> {
  const store = getStore({ name: STORE });
  const ts = Date.now();
  const id = `${ts}-${crypto.randomUUID()}`;
  await store.setJSON(k(jobId, `items/${id}.json`), item);
  return ts;
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

export async function putProgress(jobId: string, queue: string[], visited: string[]) {
  const store = getStore({ name: STORE });
  await store.setJSON(k(jobId, 'progress.json'), { queue, visited });
}

export async function getProgress(jobId: string): Promise<{ queue: string[]; visited: string[] } | null> {
  const store = getStore({ name: STORE });
  const v = await store.get(k(jobId, 'progress.json'), { type: 'json' });
  return (v as any) || null;
}
