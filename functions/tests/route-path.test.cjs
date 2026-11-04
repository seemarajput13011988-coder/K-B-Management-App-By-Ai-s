const test = require('node:test');
const assert = require('node:assert/strict');
const { routePath } = require('../lib/route-path.js');

test('normalizes direct Cloud Functions paths', () => {
  assert.equal(routePath('/auth/me'), '/api/auth/me');
  assert.equal(routePath('/_healthcheck'), '/api/_healthcheck');
});

test('preserves Firebase Hosting rewrite paths without double-prefixing', () => {
  assert.equal(routePath('/api/auth/me'), '/api/auth/me');
  assert.equal(routePath('/api/auth/me/'), '/api/auth/me');
});

test('leaves the function root unchanged', () => {
  assert.equal(routePath('/'), '/');
});


test('GPS grace period remains open until the full 15 minutes have elapsed', () => {
  const startedAt = '2026-11-04T10:00:00.000Z';
  const { gpsGracePeriodExpired } = require('../lib/route-path.js');
  const start = Date.parse(startedAt);
  assert.equal(gpsGracePeriodExpired(startedAt, start + 14 * 60 * 1000 + 59999), false);
  assert.equal(gpsGracePeriodExpired(startedAt, start + 15 * 60 * 1000), true);
  assert.equal(gpsGracePeriodExpired(startedAt, start + 16 * 60 * 1000), true);
});

test('GPS grace-period check safely rejects missing or invalid timestamps', () => {
  const { gpsGracePeriodExpired } = require('../lib/route-path.js');
  assert.equal(gpsGracePeriodExpired(undefined, Date.now()), false);
  assert.equal(gpsGracePeriodExpired('', Date.now()), false);
  assert.equal(gpsGracePeriodExpired('not-a-date', Date.now()), false);
});
