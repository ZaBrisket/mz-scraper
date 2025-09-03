import { expect, test, vi } from 'vitest';

// Stub dependencies at module scope so they are available when the function is imported
const appendEvent = vi.fn().mockResolvedValue(0);
const putState = vi.fn().mockResolvedValue(undefined);
const appendItem = vi.fn();
const putRaw = vi.fn();
let state = { id: 'job1', origin: 'https://example.com', status: 'running', pages_seen: 0, items_emitted: 0 };
const getState = vi.fn().mockImplementation(async () => state);

vi.mock('./lib/blobs', () => ({ getState, putState, appendEvent, appendItem, putRaw }));
vi.mock('./lib/readability', () => ({ extractMainContent: () => ({}) }));
vi.mock('./lib/url', () => ({ normalizeUrl: (u: string) => u }));
vi.mock('./lib/robots', () => ({ isAllowedByRobots: vi.fn().mockResolvedValue(true) }));
vi.mock('./lib/ssrf', () => ({ assertUrlIsSafe: vi.fn().mockResolvedValue(undefined) }));

// Ensure we test url-list behavior of circuit breaker

test('url list jobs attempt all same-host URLs and log failures', async () => {
  vi.unstubAllGlobals();
  process.env.MAX_RETRIES = '0';
  process.env.BASE_DELAY_MS = '0';

  const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 500 }));
  vi.stubGlobal('fetch', fetchMock);

  const runJob = (await import('./run-job-background')).default;

  const cfg = { urls: [
    'https://example.com/a',
    'https://example.com/b',
    'https://example.com/c'
  ], baseDelayMs: 0 };
  const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ jobId: 'job1', config: cfg }) });
  const res = await runJob(req, {} as any);
  expect(res.status).toBe(202);
  expect(fetchMock).toHaveBeenCalledTimes(3);
  const failedLogs = appendEvent.mock.calls.filter(([, ev]) => ev.msg?.startsWith('Fetch failed'));
  expect(failedLogs.length).toBe(3);
  const circuitLogs = appendEvent.mock.calls.filter(([, ev]) => ev.msg?.startsWith('Circuit open'));
  expect(circuitLogs.length).toBe(0);
});
