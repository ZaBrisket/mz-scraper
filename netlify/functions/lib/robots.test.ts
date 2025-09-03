import { expect, test, vi } from 'vitest';

test('caches robots.txt responses', async () => {
  vi.resetModules();
  vi.unstubAllGlobals();
  const fetchMock = vi.fn().mockResolvedValue(
    new Response('User-agent: *\n', { status: 200 })
  );
  vi.stubGlobal('fetch', fetchMock);
  const { isAllowedByRobots } = await import('./robots');

  const url = 'https://example.com/a';
  const ua = 'test-agent';
  await isAllowedByRobots(url, ua);
  await isAllowedByRobots(url, ua);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('retries fetching robots.txt on failure', async () => {
  vi.resetModules();
  vi.unstubAllGlobals();
  process.env.ROBOTS_FETCH_RETRIES = '2';
  const fetchMock = vi
    .fn()
    .mockRejectedValueOnce(new Error('fail'))
    .mockResolvedValueOnce(new Response('User-agent: *\n', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  const { isAllowedByRobots } = await import('./robots');

  const allowed = await isAllowedByRobots('https://example.com/a', 'agent');
  expect(allowed).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
