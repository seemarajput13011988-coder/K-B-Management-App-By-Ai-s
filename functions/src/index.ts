import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';

initializeApp();
const auth = getAuth();
const db = getFirestore();

type Role = 'admin' | 'staff';
type AppUser = {
  uid: string;
  userId: string;
  displayName: string;
  role: Role;
  active: boolean;
};

const clean = (value: unknown, max = 300): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

function routePath(path: string): string {
  return path.replace(/\\/+$/, '') || '/';
}

async function requireUser(req: any): Promise<AppUser | null> {
  const header = clean(req.headers.authorization, 2048);
  const token = header.startsWith('Bearer ')
    ? header.slice(7)
    : clean(req.body?.sessionToken, 4096) || clean(req.query?.sessionToken, 4096);
  if (!token) return null;
  try {
    const decoded = await auth.verifyIdToken(token);
    const snap = await db.collection('users').doc(decoded.uid).get();
    if (!snap.exists) return null;
    const data = snap.data()!;
    if (data.active !== true || !['admin', 'staff'].includes(data.role)) return null;
    return {
      uid: decoded.uid,
      userId: clean(data.userId, 40),
      displayName: clean(data.displayName, 80),
      role: data.role,
      active: true,
    };
  } catch {
    return null;
  }
}

export async function writeAudit(user: AppUser, action: string, entityType: string, entityId: string, description: string) {
  await db.collection('audit_logs').add({
    actorId: user.uid,
    actorName: user.displayName,
    action,
    entityType,
    entityId,
    description: clean(description, 240),
    createdAt: new Date().toISOString(),
    serverCreatedAt: FieldValue.serverTimestamp(),
  });
}

export const api = onRequest(
  { region: 'asia-south1', cors: true, maxInstances: 10 },
  async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const method = req.method.toUpperCase();
    const path = routePath(req.path);
    if (method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (method === 'GET' && path === '/api/_healthcheck') {
      res.status(200).json({ message: 'Success', service: 'kandb-firebase-api' });
      return;
    }

    try {
      const user = await requireUser(req);
      if (!user) {
        res.status(401).json({ error: 'Please sign in again to continue.' });
        return;
      }

      if (method === 'GET' && path === '/api/auth/me') {
        res.status(200).json({
          user: { id: user.uid, userId: user.userId, displayName: user.displayName, role: user.role, active: true },
        });
        return;
      }

      // The following route groups are intentionally deny-by-default until each
      // legacy route is ported with its original validation and role scoping.
      // This prevents a partially migrated app from exposing unprotected data.
      const known = [
        '/api/staff', '/api/plans', '/api/customers', '/api/payments',
        '/api/complaints', '/api/tasks', '/api/attendance', '/api/locations',
        '/api/announcements', '/api/messages', '/api/groups', '/api/visits',
        '/api/expenses', '/api/invoices', '/api/audit',
      ];
      const group = known.find(item => path === item || path.startsWith(item + '/'));
      if (group) {
        logger.warn('API route not migrated yet', { method, path, role: user.role });
        res.status(501).json({ error: 'This feature is being migrated and is not available yet.' });
        return;
      }

      res.status(404).json({ error: 'This API route was not found.' });
    } catch (error) {
      logger.error('Unhandled API error', error);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  },
);
