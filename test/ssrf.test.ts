import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertUrlIsSafe } from '../netlify/functions/lib/ssrf.ts';

test('blocks private ipv4', async () => {
  await assert.rejects(() => assertUrlIsSafe('http://127.0.0.1'), /blocked/i);
});

test('allows example.com', async () => {
  await assert.doesNotReject(() => assertUrlIsSafe('http://example.com'));
});
