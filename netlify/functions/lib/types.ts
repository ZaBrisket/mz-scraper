export type ISODate = string;

export interface SiteProfile {
  origin: string;
  link_selector: string;
  next_button_text: string;
  updated_at: ISODate;
}

export interface Job {
  id: string;
  origin: string;
  status: 'queued' | 'running' | 'paused' | 'stopped' | 'finished' | 'error';
  started_at?: ISODate;
  finished_at?: ISODate;
  pages_seen: number;
  items_emitted: number;
}

export type PageStatus = 'ok' | 'blocked' | 'error';

export interface Page {
  job_id: string;
  url: string;
  status: PageStatus;
  http_code?: number;
  duration_ms?: number;
  retries: number;
  error_message?: string;
}

export interface Item {
  job_id: string;
  url: string;
  title?: string;
  text?: string;
  description?: string;
  author?: string;
  published_at?: ISODate;
  metadata?: Record<string, unknown>;
}

export type Event =
  | { type: 'log'; at: ISODate; level?: 'info'|'warn'|'error'; msg: string }
  | { type: 'item'; at: ISODate; item: Item }
  | { type: 'done'; at: ISODate; items: number }
  | { type: 'error'; at: ISODate; message: string };
