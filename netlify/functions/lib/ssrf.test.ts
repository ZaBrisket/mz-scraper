import { beforeEach, expect, test, vi } from 'vitest';

const lookupMock = vi.fn();
vi.mock('node:dns/promises', () => ({ default: { lookup: lookupMock } }));

beforeEach(() => {
  vi.resetModules();
  lookupMock.mockReset();
  delete process.env.DNS_LOOKUP_RETRIES;
});

test('caches DNS lookups', async () => {
  lookupMock.mockResolvedValue([{ address: '1.1.1.1', family: 4 }]);
  const { assertUrlIsSafe } = await import('./ssrf');
  await assertUrlIsSafe('http://example.com');
  await assertUrlIsSafe('http://example.com');
  expect(lookupMock).toHaveBeenCalledTimes(1);
});

test('retries DNS lookup on failure', async () => {
  process.env.DNS_LOOKUP_RETRIES = '2';
  lookupMock
    .mockRejectedValueOnce(new Error('fail'))
    .mockResolvedValueOnce([{ address: '1.1.1.1', family: 4 }]);
  const { assertUrlIsSafe } = await import('./ssrf');
  await assertUrlIsSafe('http://example.com');
  expect(lookupMock).toHaveBeenCalledTimes(2);
});
