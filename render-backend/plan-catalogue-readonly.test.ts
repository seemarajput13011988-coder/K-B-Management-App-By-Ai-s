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

test('public plan-change intake serializes pending requests with a Firestore lock', () => {
  const route = routeBody(
    "'POST /api/portal/plan-change-requests': [async ({ body }) => {",
    "'POST /api/portal/complaints':",
  );
  assert.match(route, /firestore\\.runTransaction/);
  assert.match(route, /portal_plan_change_request_locks/);
  assert.match(route, /transaction\\.create\\(requestRef/);
  assert.doesNotMatch(route, /db\\.add\\('portal_plan_change_requests'/);
});

test('admin plan-change decisions update customer and request atomically', () => {
  const route = routeBody(
    "'POST /api/portal/plan-change-requests/:id/decision': protectedRoute(['admin'], async ({ params, body }, user) => {",
    "// Customer-facing connection requests are leads, not active customer accounts.",
  );
  assert.match(route, /firestore\\.runTransaction/);
  assert.match(route, /transaction\\.update\\(customerRef/);
  assert.match(route, /transaction\\.update\\(requestRef/);
  assert.doesNotMatch(route, /db\\.tx\\.update/);
});

test('customer complaint and photo are committed together without cleanup deletion', () => {
  const route = routeBody(
    "'POST /api/portal/complaints': [async ({ body }) => {",
    "'GET /api/portal/plan-change-requests':",
  );
  assert.match(route, /firestore\\.batch\\(\\)/);
  assert.match(route, /batch\\.create\\(complaintRef/);
  assert.match(route, /batch\\.commit\\(\\)/);
  assert.doesNotMatch(route, /db\\.delete\\('complaints'/);
});
