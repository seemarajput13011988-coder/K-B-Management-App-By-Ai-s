import { cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import type { Request, Response, NextFunction } from 'express';

const credentialJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '';
if (!credentialJson) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is required.');
const credential = JSON.parse(credentialJson);
if (credential.project_id !== 'kandb-net-sevice') throw new Error('Firebase service account must belong to project kandb-net-sevice.');
initializeApp({ credential: cert(credential), projectId: 'kandb-net-sevice' });
const firestore = getFirestore();

export type RouterContext = {
  body: Record<string, any>;
  query: Record<string, any>;
  params: Record<string, string>;
  headers: Record<string, any>;
  method: string;
  path: string;
  request: Request;
};
export type RouterMiddleware = (ctx: RouterContext) => Promise<any> | any;

type RecordData = Record<string, any>;
type UpdateData = { id: string; record: RecordData };

function withoutId(record: RecordData): RecordData {
  const value = { ...record };
  delete value.id;
  return value;
}

async function readRecords<T = RecordData>(collection: string, ids: string[]): Promise<(T | null)[]> {
  const refs = ids.map(id => firestore.collection(collection).doc(String(id)));
  const snapshots = await Promise.all(refs.map(ref => ref.get()));
  return snapshots.map(snapshot => snapshot.exists ? ({ ...(snapshot.data() || {}), id: snapshot.id } as T) : null);
}

async function addRecords(collection: string, records: RecordData[]): Promise<string[]> {
  const batch = firestore.batch();
  const ids: string[] = [];
  for (const record of records) {
    const ref = record.id
      ? firestore.collection(collection).doc(String(record.id))
      : firestore.collection(collection).doc();
    batch.set(ref, { ...withoutId(record), id: ref.id });
    ids.push(ref.id);
  }
  if (records.length) await batch.commit();
  return ids;
}

async function transactionAdd(collection: string, records: RecordData[]): Promise<boolean[]> {
  // Read and create inside one Firestore transaction. A separate read followed by
  // batch.create can race when two requests try to create the same deterministic ID.
  return firestore.runTransaction(async transaction => {
    const refs = records.map(record => record.id
      ? firestore.collection(collection).doc(String(record.id))
      : firestore.collection(collection).doc());
    const snapshots = await Promise.all(refs.map(ref => transaction.get(ref)));
    const results = snapshots.map(snapshot => !snapshot.exists);

    // Firestore requires every transaction read to finish before its first write.
    snapshots.forEach((snapshot, index) => {
      if (results[index]) {
        transaction.create(refs[index], { ...withoutId(records[index]), id: refs[index].id });
      }
    });
    return results;
  });
}

async function updateRecords(collection: string, updates: UpdateData[]): Promise<boolean[]> {
  const refs = updates.map(item => firestore.collection(collection).doc(String(item.id)));
  const snapshots = await Promise.all(refs.map(ref => ref.get()));
  const batch = firestore.batch();
  const results = snapshots.map(snapshot => snapshot.exists);
  snapshots.forEach((snapshot, index) => {
    if (results[index]) batch.update(refs[index], { ...withoutId(updates[index].record), updatedAt: updates[index].record.updatedAt || new Date().toISOString() });
  });
  if (results.some(Boolean)) await batch.commit();
  return results;
}

async function deleteRecords(collection: string, ids: string[]): Promise<boolean[]> {
  const refs = ids.map(id => firestore.collection(collection).doc(String(id)));
  const snapshots = await Promise.all(refs.map(ref => ref.get()));
  const batch = firestore.batch();
  const results = snapshots.map(snapshot => snapshot.exists);
  snapshots.forEach((snapshot, index) => { if (results[index]) batch.delete(refs[index]); });
  if (results.some(Boolean)) await batch.commit();
  return results;
}

export const db = {
  async get<T = RecordData>(collection: string, ids: string[], _options?: RecordData): Promise<(T | null)[]> {
    return readRecords<T>(collection, ids);
  },
  async list<T = RecordData>(collection: string, options: { limit?: number } = {}): Promise<{ items: T[] }> {
    const query = firestore.collection(collection).limit(Math.max(1, Math.min(Number(options.limit || 500), 1000)));
    const snapshot = await query.get();
    return { items: snapshot.docs.map(doc => ({ ...(doc.data() || {}), id: doc.id } as T)) };
  },
  async add(collection: string, records: RecordData[]): Promise<string[]> {
    return addRecords(collection, records);
  },
  async update(collection: string, updates: UpdateData[]): Promise<boolean[]> {
    return updateRecords(collection, updates);
  },
  async delete(collection: string, ids: string[]): Promise<boolean[]> {
    return deleteRecords(collection, ids);
  },
  tx: {
    async add(collection: string, records: RecordData[]): Promise<boolean[]> {
      return transactionAdd(collection, records);
    },
    async update(collection: string, updates: UpdateData[], _options?: RecordData): Promise<boolean[]> {
      // Preserve the tx.update contract: read all target documents and apply the
      // complete update set atomically, with Firestore retrying on contention.
      return firestore.runTransaction(async transaction => {
        const refs = updates.map(item => firestore.collection(collection).doc(String(item.id)));
        const snapshots = await Promise.all(refs.map(ref => transaction.get(ref)));
        const results = snapshots.map(snapshot => snapshot.exists);

        // All reads are complete before any writes are queued.
        snapshots.forEach((snapshot, index) => {
          if (results[index]) {
            transaction.update(refs[index], {
              ...withoutId(updates[index].record),
              updatedAt: updates[index].record.updatedAt || new Date().toISOString(),
            });
          }
        });
        return results;
      });
    },
  },
};

export const secrets = {
  async listSecretNames(): Promise<string[]> {
    return ['ADMIN_INITIAL_PASSWORD', 'ADMIN_RECOVERY_CODE', 'ADMIN_BOOTSTRAP_SECRET'].filter(key => Boolean(process.env[key]));
  },
  async readSecret(name: string): Promise<string> {
    const value = process.env[name];
    if (!value) throw new Error('Required server secret is not configured.');
    return value;
  },
};

export function json(body: unknown, status = 200) {
  return { __kbHttpResult: true as const, status, body };
}
export function error(message: string, status = 400) {
  return { __kbHttpResult: true as const, status, body: { error: message } };
}

function matchRoute(route: string, path: string): Record<string, string> | null {
  const expected = route.split('/').filter(Boolean);
  const actual = path.split('/').filter(Boolean);
  if (expected.length !== actual.length) return null;
  const params: Record<string, string> = {};
  for (let index = 0; index < expected.length; index += 1) {
    if (expected[index].startsWith(':')) {
      try { params[expected[index].slice(1)] = decodeURIComponent(actual[index]); }
      catch { return null; }
    } else if (expected[index] !== actual[index]) return null;
  }
  return params;
}

export function router(routes: Record<string, RouterMiddleware[]>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const path = (req.path || '/').replace(/\/+$/, '') || '/';
    const method = req.method.toUpperCase();
    let selected: RouterMiddleware[] | undefined;
    let params: Record<string, string> = {};
    for (const [signature, middleware] of Object.entries(routes)) {
      const splitAt = signature.indexOf(' ');
      if (splitAt < 0 || signature.slice(0, splitAt).toUpperCase() !== method) continue;
      const match = matchRoute(signature.slice(splitAt + 1), path);
      if (match) { selected = middleware; params = match; break; }
    }
    if (!selected) return next();
    const ctx: RouterContext = {
      body: req.body && typeof req.body === 'object' ? req.body : {},
      query: req.query as Record<string, any>,
      params,
      headers: req.headers as Record<string, any>,
      method,
      path,
      request: req,
    };
    try {
      for (const middleware of selected) {
        const result = await middleware(ctx);
        if (result?.__kbHttpResult) {
          if (!res.headersSent) res.status(result.status).json(result.body);
          return;
        }
        if (res.headersSent) return;
      }
      if (!res.headersSent) res.status(204).send();
    } catch (cause: any) {
      const code = cause && typeof cause === 'object' ? cause.code : undefined;
      console.error('[K&B_LEGACY_API_REQUEST_FAILED]', JSON.stringify({
        method,
        path,
        code: typeof code === 'string' || typeof code === 'number' ? code : 'unknown',
      }));
      if (!res.headersSent) {
        if (code === 7 || code === 'permission-denied') {
          res.status(503).json({ error: 'K&B database access is unavailable. The server administrator must restore Firestore permissions before this action can continue.' });
        } else {
          res.status(500).json({ error: 'Something went wrong. Please try again.' });
        }
      }
    }
  };
}

export { firestore, FieldValue };
