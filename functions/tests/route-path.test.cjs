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
