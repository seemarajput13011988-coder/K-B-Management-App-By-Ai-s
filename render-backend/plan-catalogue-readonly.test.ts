import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./legacy-routes.ts', import.meta.url), 'utf8');

function routeBody(start: string, next: string): string {
  const startAt = source.indexOf(start);
  assert.notEqual(startAt, -1, `route not found: ${start}`);
  const endAt = source.indexOf(next, startAt + start.length);
  assert.notEqual(endAt, -1, `next route not found: ${next}`);
  return source.slice(startAt, endAt);
}

test('public customer plan catalogue GET never writes Firestore', () => {
  const route = routeBody(
    "'GET /api/portal/plans': [async () => {",
    "'POST /api/portal/plan-change-requests':",
  );
  assert.doesNotMatch(route, /db\.tx\.add|db\.tx\.update|db\.delete|\.set\(|\.update\(|\.delete\(/);
});

test('admin and staff plan catalogue GET never writes Firestore', () => {
  const route = routeBody(
    "'GET /api/plans': protectedRoute(['admin', 'staff'], async (_ctx, user) => {",
    "'POST /api/plans':",
  );
  assert.doesNotMatch(route, /db\.tx\.add|db\.tx\.update|db\.delete|\.set\(|\.update\(|\.delete\(/);
});

test('plan catalogue GET routes do not depend on implicit default-plan seeding', () => {
  assert.doesNotMatch(source, /defaultPlans/);
});
