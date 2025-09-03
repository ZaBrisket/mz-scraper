import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRobots } from '../netlify/functions/lib/robots.ts';

test('parseRobots respects disallow', () => {
  const content = 'User-agent: *\nDisallow: /private';
  assert.equal(parseRobots(content, 'testbot', '/private/page'), false);
  assert.equal(parseRobots(content, 'testbot', '/public'), true);
});
