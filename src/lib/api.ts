import { CapacitorHttp } from '@capacitor/core';
import { browserLocalPersistence, EmailAuthProvider, onAuthStateChanged, reauthenticateWithCredential, setPersistence, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, runTransaction, updateDoc, where, writeBatch } from 'firebase/firestore';
import { firebaseAuth, firestore } from './firebase';

const API_BASE = import.meta.env.VITE_FIREBASE_FUNCTIONS_URL || 'https://asia-south1-kandb-net-sevice.cloudfunctions.net/api';
const ACCOUNT_DOMAIN = 'accounts.kandbnetservice.in';
type ApiResult<T = any> = { data: T };


const defaultPlans = [
  { id: 'default-plan-1', name: 'RailWire 30 Mbps', provider: 'RailWire', speed: '30 Mbps', data: '1.5 TB', price: 549, note: 'Popular home plan', connectionType: 'Fiber', featured: true, active: true },
  { id: 'default-plan-2', name: 'RailWire 50 Mbps', provider: 'RailWire', speed: '50 Mbps', data: '2 TB', price: 699, note: 'For multiple devices', connectionType: 'Fiber', featured: false, active: true },
  { id: 'default-plan-3', name: 'RailWire 100 Mbps', provider: 'RailWire', speed: '100 Mbps', data: '3 TB', price: 899, note: 'Heavy usage', connectionType: 'Fiber', featured: false, active: true },
  { id: 'default-plan-4', name: 'BSNL / Air Fibre', provider: 'BSNL / Air Fibre', speed: 'As configured', data: 'Plan based', price: 799, note: 'Custom connection', connectionType: 'Air Fibre', featured: false, active: true },
];

async function requestPlans<T = any>(path: string, method: string, payload?: Record<string, unknown>): Promise<ApiResult<T>> {
  if (!firebaseAuth?.currentUser || !firestore) throw new Error('Please sign in again to continue.');
  const profile = await getAppUserProfile();
  const admin = profile.role === 'admin';
  const base = '/api/plans';
  const id = path.startsWith(base + '/') ? decodeURIComponent(path.slice(base.length + 1).split('?')[0]) : '';
  const plans = collection(firestore, 'plans');
  const clean = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max);
  const validPlan = (p: Record<string, unknown>) => {
    const name = clean(p.name, 80), provider = clean(p.provider, 60), speed = clean(p.speed, 40);
    const data = clean(p.data, 40), connectionType = clean(p.connectionType, 40);
    const price = Number(p.price);
    if (!name || !provider || !speed || !data || !connectionType || !Number.isFinite(price) || price < 0 || price > 1000000) {
      throw new Error('Enter a plan name, provider, speed, data limit, connection type and valid monthly price.');
    }
    return { name, provider, speed, data, price, note: clean(p.note, 180), connectionType, featured: p.featured === true, active: p.active !== false };
  };
  if (method === 'GET' && path.split('?')[0] === base) {
    let snap = await getDocs(admin ? plans : query(plans, where('active', '==', true)));
    if (admin && snap.empty) {
      const batch = writeBatch(firestore);
      for (const plan of defaultPlans) {
        const { id: planId, ...data } = plan;
        batch.set(doc(firestore, 'plans', planId), data);
      }
      await batch.commit();
      snap = await getDocs(plans);
    }
    return { data: { items: snap.docs.map(item => ({ id: item.id, ...item.data() })) } as T };
  }
  if (!admin) throw new Error('Only administrators can manage internet plans.');
  if (method === 'POST' && path.split('?')[0] === base) {
    const record = validPlan(payload || {});
    const existing = await getDocs(plans);
    if (existing.docs.some(item => String(item.data().name || '').toLowerCase() === record.name.toLowerCase())) throw new Error('A plan with this name already exists.');
    const ref = await addDoc(plans, record);
    return { data: { id: ref.id, ...record } as T };
  }
  if (id && (method === 'PUT' || method === 'DELETE')) {
    const ref = doc(firestore, 'plans', id);
    const existing = await getDoc(ref);
    if (!existing.exists()) throw new Error('Plan not found.');
    if (method === 'PUT') {
      const record = validPlan(payload || {});
      const all = await getDocs(plans);
      if (all.docs.some(item => item.id !== id && String(item.data().name || '').toLowerCase() === record.name.toLowerCase())) throw new Error('Another plan already uses this name.');
      await updateDoc(ref, record);
      return { data: { updated: true } as T };
    }
    const customers = await getDocs(collection(firestore, 'customers'));
    if (customers.docs.some(item => String(item.data().plan || '').toLowerCase() === String(existing.data().name || '').toLowerCase())) {
      throw new Error('This plan is linked to customers. Archive it to preserve their history.');
    }
    if (allPlanCountTooSmall(await getDocs(plans))) throw new Error('Keep at least one plan in the catalogue.');
    await deleteDoc(ref);
    return { data: { deleted: true } as T };
  }
  throw new Error('Unsupported plans request.');
}
function allPlanCountTooSmall(snapshot: Awaited<ReturnType<typeof getDocs>>) { return snapshot.size <= 1; }


async function requestCustomers<T = any>(path: string, method: string, payload?: Record<string, unknown>): Promise<ApiResult<T>> {
  if (!firebaseAuth?.currentUser || !firestore) throw new Error('Please sign in again to continue.');
  const profile = await getAppUserProfile();
  const admin = profile.role === 'admin';
  const base = '/api/customers';
  const clean = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max);
  const customers = collection(firestore, 'customers');
  const id = path.startsWith(base + '/') ? decodeURIComponent(path.slice(base.length + 1).split('?')[0]) : '';
  const dateOk = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + 'T00:00:00'));
  if (method === 'GET' && path.split('?')[0] === base) {
    const snap = await getDocs(admin ? customers : query(customers, where('assignedTo', '==', firebaseAuth.currentUser.uid)));
    return { data: { items: snap.docs.map(item => ({ id: item.id, ...item.data() })) } as T };
  }
  if (method === 'POST' && path.split('?')[0] === base) {
    if (!admin) throw new Error('Only administrators can add customers.');
    const name = clean(payload?.name, 100), phone = clean(payload?.phone, 30), address = clean(payload?.address, 300);
    const plan = clean(payload?.plan, 100), monthlyFee = Number(payload?.monthlyFee), dueDate = clean(payload?.dueDate, 10);
    if (!name || !phone || !address || !plan || !Number.isFinite(monthlyFee) || monthlyFee < 0 || !dateOk(dueDate)) {
      throw new Error('Enter customer name, phone, address, plan, valid monthly fee and due date.');
    }
    const assignedTo = clean(payload?.assignedTo, 128);
    let assignedToName = '';
    if (assignedTo) {
      const staff = await getDoc(doc(firestore, 'users', assignedTo));
      if (!staff.exists() || staff.data().role !== 'staff' || staff.data().active !== true) throw new Error('Select an active staff member.');
      assignedToName = clean(staff.data().displayName, 80);
    }
    const record = {
      name, phone, address, plan, monthlyFee,
      status: ['Active', 'Inactive', 'Suspended'].includes(String(payload?.status)) ? payload?.status : 'Active',
      joinedAt: clean(payload?.joinedAt, 10) || new Date().toISOString().slice(0, 10),
      dueDate, notes: clean(payload?.notes, 1000), assignedTo, assignedToName,
      createdAt: new Date().toISOString()
    };
    const ref = await addDoc(customers, record);
    return { data: { id: ref.id, ...record } as T };
  }
  if (id && (method === 'PUT' || method === 'DELETE')) {
    const ref = doc(firestore, 'customers', id);
    const existing = await getDoc(ref);
    if (!existing.exists()) throw new Error('Customer not found.');
    const current = existing.data();
    if (!admin && current.assignedTo !== firebaseAuth.currentUser.uid) throw new Error('You can access only customers assigned to you.');
    if (method === 'DELETE') {
      if (!admin) throw new Error('Only administrators can delete customers.');
      await deleteDoc(ref);
      return { data: { deleted: true } as T };
    }
    const updatedAt = new Date().toISOString();
    if (!admin) {
      const patch = { phone: clean(payload?.phone, 30), address: clean(payload?.address, 300), notes: clean(payload?.notes, 1000), updatedAt };
      await updateDoc(ref, patch);
      return { data: { updated: true } as T };
    }
    const patch: Record<string, unknown> = {};
    for (const key of ['name', 'phone', 'address', 'plan', 'status', 'joinedAt', 'dueDate']) {
      if (payload?.[key] !== undefined) patch[key] = clean(payload[key], key === 'address' ? 300 : 120);
    }
    if (payload?.monthlyFee !== undefined) {
      const fee = Number(payload.monthlyFee);
      if (!Number.isFinite(fee) || fee < 0) throw new Error('Enter a valid monthly fee.');
      patch.monthlyFee = fee;
    }
    if (payload?.notes !== undefined) patch.notes = clean(payload.notes, 1000);
    if (payload?.assignedTo !== undefined) {
      const assignedTo = clean(payload.assignedTo, 128);
      let assignedToName = '';
      if (assignedTo) {
        const staff = await getDoc(doc(firestore, 'users', assignedTo));
        if (!staff.exists() || staff.data().role !== 'staff' || staff.data().active !== true) throw new Error('Select an active staff member.');
        assignedToName = clean(staff.data().displayName, 80);
      }
      patch.assignedTo = assignedTo;
      patch.assignedToName = assignedToName;
    }
    patch.updatedAt = updatedAt;
    await updateDoc(ref, patch);
    return { data: { updated: true } as T };
  }
  throw new Error('Unsupported customers request.');
}


async function requestPayments<T = any>(path: string, method: string, payload?: Record<string, unknown>): Promise<ApiResult<T>> {
  if (!firebaseAuth?.currentUser || !firestore) throw new Error('Please sign in again to continue.');
  const profile = await getAppUserProfile();
  const admin = profile.role === 'admin';
  const payments = collection(firestore, 'payments');
  const base = '/api/payments';
  const id = path.startsWith(base + '/') ? decodeURIComponent(path.slice(base.length + 1).split('?')[0]) : '';
  if (method === 'GET' && path.split('?')[0] === base) {
    const snap = await getDocs(admin ? payments : query(payments, where('recordedBy', '==', firebaseAuth.currentUser.uid)));
    return { data: { items: snap.docs.map(item => ({ id: item.id, ...item.data() })) } as T };
  }
  if (method === 'POST' && path.split('?')[0] === base) {
    const customerId = String(payload?.customerId || '').trim();
    const amount = Number(payload?.amount);
    const methodName = String(payload?.method || '').trim().slice(0, 40);
    const paidAt = String(payload?.paidAt || '').trim();
    const month = String(payload?.month || '').trim().slice(0, 40);
    if (!customerId || !Number.isFinite(amount) || amount <= 0 || !methodName || !/^\d{4}-\d{2}-\d{2}$/.test(paidAt) || !month) {
      throw new Error('Enter a valid customer, amount, payment method, payment date and billing month.');
    }
    const customer = await getDoc(doc(firestore, 'customers', customerId));
    if (!customer.exists()) throw new Error('Customer not found.');
    if (!admin && customer.data().assignedTo !== firebaseAuth.currentUser.uid) {
      throw new Error('You can record payments only for your assigned customers.');
    }
    const record = {
      customerId, customerName: String(customer.data().name || '').slice(0, 100),
      amount, method: methodName, paidAt, month,
      recordedBy: firebaseAuth.currentUser.uid, recordedByName: profile.displayName,
      createdAt: new Date().toISOString()
    };
    const ref = await addDoc(payments, record);
    return { data: { id: ref.id, ...record } as T };
  }
  if (id && method === 'DELETE') {
    if (!admin) throw new Error('Only administrators can delete payment records.');
    const ref = doc(firestore, 'payments', id);
    const existing = await getDoc(ref);
    if (!existing.exists()) throw new Error('Payment record not found.');
    await deleteDoc(ref);
    return { data: { deleted: true } as T };
  }
  throw new Error('Unsupported payments request.');
}


async function requestTasks<T = any>(path: string, method: string, payload?: Record<string, unknown>): Promise<ApiResult<T>> {
  if (!firebaseAuth?.currentUser || !firestore) throw new Error('Please sign in again to continue.');
  const profile = await getAppUserProfile();
  const admin = profile.role === 'admin';
  const tasks = collection(firestore, 'tasks');
  const base = '/api/tasks';
  const id = path.startsWith(base + '/') ? decodeURIComponent(path.slice(base.length + 1).split('?')[0]) : '';
  const clean = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max);
  const validStatus = (value: string) => ['Pending', 'In progress', 'Completed'].includes(value);
  if (method === 'GET' && path.split('?')[0] === base) {
    const snap = await getDocs(admin ? tasks : query(tasks, where('assignedTo', '==', firebaseAuth.currentUser.uid)));
    return { data: { items: snap.docs.map(item => ({ id: item.id, ...item.data() })) } as T };
  }
  if (method === 'POST' && path.split('?')[0] === base) {
    if (!admin) throw new Error('Only administrators can assign work.');
    const title = clean(payload?.title, 120), assignedTo = clean(payload?.assignedTo, 128), dueDate = clean(payload?.dueDate, 10);
    const staff = await getDoc(doc(firestore, 'users', assignedTo));
    if (!title || !assignedTo || !staff.exists() || staff.data().role !== 'staff' || staff.data().active !== true || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      throw new Error('Enter a task title, select an active staff member and choose a valid due date.');
    }
    const record = {
      title, details: clean(payload?.details, 1500), assignedTo,
      assignedToName: clean(staff.data().displayName, 80),
      priority: ['Low', 'Normal', 'High'].includes(String(payload?.priority)) ? payload?.priority : 'Normal',
      dueDate, status: 'Pending', createdAt: new Date().toISOString(),
      createdBy: firebaseAuth.currentUser.uid, createdByName: profile.displayName
    };
    const batch = writeBatch(firestore);
    const taskRef = doc(tasks);
    batch.set(taskRef, record);
    batch.set(doc(collection(firestore, 'staff_notifications')), {
      recipientId: assignedTo, recipientRole: 'staff', type: 'task-assigned',
      title: 'New work assigned', message: title + ' · Due ' + dueDate,
      createdAt: new Date().toISOString(), read: false, relatedId: taskRef.id
    });
    await batch.commit();
    return { data: { id: taskRef.id, ...record } as T };
  }
  if (id && (method === 'PUT' || method === 'DELETE')) {
    const ref = doc(firestore, 'tasks', id);
    const existing = await getDoc(ref);
    if (!existing.exists()) throw new Error('Task not found.');
    const current = existing.data();
    if (!admin && current.assignedTo !== firebaseAuth.currentUser.uid) throw new Error('You can update only your assigned tasks.');
    if (method === 'DELETE') {
      if (!admin) throw new Error('Only administrators can delete tasks.');
      await deleteDoc(ref);
      return { data: { deleted: true } as T };
    }
    const status = clean(payload?.status, 30);
    if (status && !validStatus(status)) throw new Error('Choose a valid task status.');
    if (!admin && Object.keys(payload || {}).some(key => key !== 'status' && key !== 'sessionToken')) throw new Error('Staff can update task status only.');
    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (status) patch.status = status;
    if (admin) {
      if (payload?.title !== undefined) patch.title = clean(payload.title, 120);
      if (payload?.details !== undefined) patch.details = clean(payload.details, 1500);
      if (payload?.dueDate !== undefined) {
        const dueDate = clean(payload.dueDate, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw new Error('Choose a valid due date.');
        patch.dueDate = dueDate;
      }
    }
    const batch = writeBatch(firestore);
    batch.update(ref, patch);
    const statusChanged = !!status && status !== current.status;
    const detailsChanged = admin && ['title', 'details', 'dueDate'].some(key => patch[key] !== undefined);
    if (statusChanged || detailsChanged) {
      const recipients: Array<{ id: string; role: string }> = [];
      if (admin && current.assignedTo) recipients.push({ id: String(current.assignedTo), role: 'staff' });
      if (!admin) {
        if (current.createdBy) recipients.push({ id: String(current.createdBy), role: 'admin' });
      }
      const title = statusChanged ? 'Work status updated' : 'Work details updated';
      const message = statusChanged ? String(current.title) + ' is now ' + status + '.' : String(patch.title || current.title) + ' was updated by ' + profile.displayName + '.';
      for (const recipient of recipients) {
        batch.set(doc(collection(firestore, 'staff_notifications')), {
          recipientId: recipient.id, recipientRole: recipient.role, type: 'task-update',
          title, message: message.slice(0, 180), createdAt: new Date().toISOString(), read: false, relatedId: id
        });
      }
    }
    await batch.commit();
    return { data: { updated: true } as T };
  }
  throw new Error('Unsupported tasks request.');
}


async function requestComplaints<T = any>(path: string, method: string, payload?: Record<string, unknown>): Promise<ApiResult<T>> {
  if (!firebaseAuth?.currentUser || !firestore) throw new Error('Please sign in again to continue.');
  const profile = await getAppUserProfile();
  const admin = profile.role === 'admin';
  const currentUid = firebaseAuth.currentUser.uid;
  const base = '/api/complaints';
  const complaints = collection(firestore, 'complaints');
  const id = path.startsWith(base + '/') ? decodeURIComponent(path.slice(base.length + 1).split('?')[0]) : '';
  const clean = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max);
  if (method === 'GET' && path.split('?')[0] === base) {
    if (admin) {
      const snap = await getDocs(complaints);
      return { data: { items: snap.docs.map(item => ({ id: item.id, ...item.data() })) } as T };
    }
    const [assigned, created] = await Promise.all([
      getDocs(query(complaints, where('assignedTo', '==', currentUid))),
      getDocs(query(complaints, where('createdBy', '==', currentUid)))
    ]);
    const unique = new Map<string, any>();
    [...assigned.docs, ...created.docs].forEach(item => unique.set(item.id, { id: item.id, ...item.data() }));
    return { data: { items: [...unique.values()] } as T };
  }
  if (method === 'POST' && path.split('?')[0] === base) {
    const subject = clean(payload?.subject, 120), details = clean(payload?.details, 1500);
    const priority = ['Low', 'Normal', 'High', 'Urgent'].includes(String(payload?.priority)) ? payload?.priority : 'Normal';
    if (!subject || !details) throw new Error('Enter a complaint subject and details.');
    const customerId = clean(payload?.customerId, 128);
    let customer: Record<string, any> | null = null;
    if (customerId) {
      const snapshot = await getDoc(doc(firestore, 'customers', customerId));
      if (!snapshot.exists()) throw new Error('Customer not found.');
      customer = snapshot.data();
      if (!admin && customer.assignedTo !== currentUid) throw new Error('You can raise complaints only for assigned customers.');
    }
    const record = {
      customerId, customerName: clean(payload?.customerName, 100) || clean(customer?.name, 100),
      subject, details, priority, status: 'Open', createdAt: new Date().toISOString(),
      createdBy: currentUid, createdByName: profile.displayName, assignedTo: '', assignedToName: ''
    };
    const ref = await addDoc(complaints, record);
    return { data: { id: ref.id, ...record } as T };
  }
  if (id && (method === 'PUT' || method === 'DELETE')) {
    if (!admin) throw new Error('Only administrators can manage service tickets.');
    const ref = doc(firestore, 'complaints', id);
    const existing = await getDoc(ref);
    if (!existing.exists()) throw new Error('Complaint not found.');
    if (method === 'DELETE') {
      await deleteDoc(ref);
      return { data: { deleted: true } as T };
    }
    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    const status = clean(payload?.status, 30);
    if (status) {
      if (!['Open', 'In progress', 'Resolved'].includes(status)) throw new Error('Choose a valid complaint status.');
      patch.status = status;
    }
    if (Object.prototype.hasOwnProperty.call(payload || {}, 'assignedTo')) {
      const assignedTo = clean(payload?.assignedTo, 128);
      let assignedToName = '';
      if (assignedTo) {
        const staff = await getDoc(doc(firestore, 'users', assignedTo));
        if (!staff.exists() || staff.data().role !== 'staff' || staff.data().active !== true) throw new Error('Choose an active staff member for this ticket.');
        assignedToName = clean(staff.data().displayName, 80);
      }
      patch.assignedTo = assignedTo;
      patch.assignedToName = assignedToName;
    }
    await updateDoc(ref, patch);
    return { data: { updated: true } as T };
  }
  throw new Error('Unsupported complaints request.');
}


async function requestSubscriptions<T = any>(path: string, method: string, payload?: Record<string, unknown>): Promise<ApiResult<T>> {
  if (!firebaseAuth?.currentUser || !firestore) throw new Error('Please sign in again to continue.');
  const profile = await getAppUserProfile();
  const admin = profile.role === 'admin';
  const uid = firebaseAuth.currentUser.uid;
  const subscriptions = collection(firestore, 'subscriptions');
  const base = '/api/subscriptions';
  const id = path.startsWith(base + '/') ? decodeURIComponent(path.slice(base.length + 1).split('?')[0]) : '';
  const clean = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max);
  const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + 'T00:00:00'));
  if (method === 'GET' && path.split('?')[0] === base) {
    if (admin) {
      const snap = await getDocs(subscriptions);
      const items = snap.docs.map(item => ({ id: item.id, ...item.data() }));
      items.sort((a: any, b: any) => String(b.startDate || '').localeCompare(String(a.startDate || '')));
      return { data: { items } as T };
    }
    const assigned = await getDocs(query(collection(firestore, 'customers'), where('assignedTo', '==', uid)));
    const customerIds = assigned.docs.map(item => item.id);
    const all: any[] = [];
    for (let i = 0; i < customerIds.length; i += 30) {
      const group = customerIds.slice(i, i + 30);
      if (!group.length) continue;
      const snap = await getDocs(query(subscriptions, where('customerId', 'in', group)));
      all.push(...snap.docs.map(item => ({ id: item.id, ...item.data() })));
    }
    all.sort((a, b) => String(b.startDate || '').localeCompare(String(a.startDate || '')));
    return { data: { items: all } as T };
  }
  if (method === 'POST' && path.split('?')[0] === base) {
    const customerId = clean(payload?.customerId, 128);
    const plan = clean(payload?.plan, 100), startDate = clean(payload?.startDate, 10), endDate = clean(payload?.endDate, 10);
    const amount = Number(payload?.amount), paymentStatus = payload?.paymentStatus === 'Paid' ? 'Paid' : 'Pending';
    const paidAt = clean(payload?.paidAt, 10), paymentMethod = clean(payload?.paymentMethod, 40);
    if (!customerId || !plan || !validDate(startDate) || !validDate(endDate) || endDate < startDate || !Number.isFinite(amount) || amount <= 0) {
      throw new Error('Choose a customer and plan, enter valid start/end dates and a renewal amount.');
    }
    if (paymentStatus === 'Paid' && (!validDate(paidAt) || !paymentMethod)) throw new Error('A paid renewal needs a valid payment date and payment method.');
    const customerRef = doc(firestore, 'customers', customerId);
    const customer = await getDoc(customerRef);
    if (!customer.exists()) throw new Error('Customer not found.');
    if (!admin && customer.data().assignedTo !== uid) throw new Error('You can renew only customers assigned to you.');
    const customerName = clean(customer.data().name, 100);
    const createdAt = new Date().toISOString();
    const subscriptionRef = doc(subscriptions);
    const paymentRef = paymentStatus === 'Paid' ? doc(collection(firestore, 'payments')) : null;
    const record = {
      customerId, customerName, plan, startDate, endDate, amount,
      status: 'Active', paymentStatus, createdAt, createdBy: uid, createdByName: profile.displayName,
      paidAt: paymentStatus === 'Paid' ? paidAt : '',
      paymentMethod: paymentStatus === 'Paid' ? paymentMethod : ''
    };
    const existingSubscriptions = await getDocs(query(subscriptions, where('customerId', '==', customerId)));
    const overlaps = existingSubscriptions.docs.some(item => {
      const data = item.data();
      return !['Cancelled', 'Expired'].includes(String(data.status))
        && typeof data.startDate === 'string' && typeof data.endDate === 'string'
        && data.startDate <= endDate && data.endDate >= startDate;
    });
    if (overlaps) throw new Error('This renewal overlaps an existing active subscription. Check the current expiry date first.');
    await runTransaction(firestore, async transaction => {
      const latestCustomer = await transaction.get(customerRef);
      if (!latestCustomer.exists()) throw new Error('Customer no longer exists.');
      transaction.set(subscriptionRef, record);
      const currentDueDate = String(latestCustomer.data().dueDate || '');
      const customerPatch: Record<string, unknown> = { plan, monthlyFee: amount, updatedAt: createdAt, lastSubscriptionId: subscriptionRef.id };
      if (!currentDueDate || endDate >= currentDueDate) customerPatch.dueDate = endDate;
      transaction.update(customerRef, customerPatch);
      if (paymentRef) transaction.set(paymentRef, {
        customerId, customerName, amount, method: paymentMethod, paidAt,
        month: paidAt.slice(0, 7), recordedBy: uid, recordedByName: profile.displayName,
        createdAt, subscriptionId: subscriptionRef.id
      });
    });
    return { data: { id: subscriptionRef.id, ...record, paymentId: paymentRef?.id || null } as T };
  }
  if (id && (method === 'PUT' || method === 'DELETE')) {
    if (!admin) throw new Error('Only administrators can manage renewal status.');
    const ref = doc(firestore, 'subscriptions', id);
    const existing = await getDoc(ref);
    if (!existing.exists()) throw new Error('Subscription not found.');
    if (method === 'DELETE') throw new Error('Renewal history is preserved. Change the status to Cancelled instead.');
    const status = clean(payload?.status, 20);
    if (!['Active', 'Pending', 'Expired', 'Cancelled'].includes(status)) throw new Error('Choose Active, Pending, Expired or Cancelled.');
    await updateDoc(ref, { status, notes: clean(payload?.notes, 500), updatedAt: new Date().toISOString(), updatedBy: uid });
    return { data: { updated: true } as T };
  }
  throw new Error('Unsupported subscriptions request.');
}

async function requestAttendance<T = any>(path: string, method: string, payload?: Record<string, unknown>): Promise<ApiResult<T>> {
  if (!firebaseAuth?.currentUser || !firestore) throw new Error('Please sign in again to continue.');
  const user = firebaseAuth.currentUser;
  const profile = await getAppUserProfile();
  const admin = profile.role === 'admin';
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const stamp = new Date().toISOString();
  const attendance = collection(firestore, 'attendance');
  const locations = collection(firestore, 'locations');
  const clean = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max);
  const validCoords = (p: Record<string, unknown>) => {
    const latitude = Number(p.latitude), longitude = Number(p.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      throw new Error('Enable precise location and obtain a GPS fix before starting or updating your shift.');
    }
    return { latitude, longitude, accuracy: Math.min(Math.max(Number(p.accuracy) || 0, 0), 100000) };
  };
  const pathOnly = path.split('?')[0];
  if (pathOnly === '/api/attendance' && method === 'GET') {
    const snap = await getDocs(admin ? attendance : query(attendance, where('userId', '==', user.uid)));
    const items = snap.docs.map(item => ({ id: item.id, ...item.data() }));
    items.sort((a: any, b: any) => String(b.workDate || '').localeCompare(String(a.workDate || '')));
    return { data: { items } as T };
  }
  if (pathOnly === '/api/attendance/check-in' && method === 'POST') {
    if (admin) throw new Error('Staff must start their own shift.');
    const coords = validCoords(payload || {});
    const dayType = payload?.dayType === 'Half day' ? 'Half day' : 'Full day';
    const todays = await getDocs(query(attendance, where('userId', '==', user.uid), where('workDate', '==', today)));
    if (!todays.empty) throw new Error('Attendance already exists today. Ask an administrator if a GPS-cancelled shift needs restarting.');
    const id = 'att-' + user.uid + '-' + today;
    const shiftRef = doc(firestore, 'attendance', id);
    const locationRef = doc(locations);
    const batch = writeBatch(firestore);
    batch.set(shiftRef, {
      userId: user.uid, displayName: profile.displayName, workDate: today,
      checkInAt: stamp, status: 'Checked in', dayType, gpsStatus: 'active',
      attendanceSource: 'Staff', shiftEvents: []
    });
    batch.set(locationRef, { ...coords, userId: user.uid, displayName: profile.displayName, attendanceId: id, capturedAt: clean(payload?.capturedAt, 40) || stamp });
    await batch.commit();
    return { data: { id, userId: user.uid, displayName: profile.displayName, workDate: today, checkInAt: stamp, status: 'Checked in', dayType, gpsStatus: 'active' } as T };
  }
  if (pathOnly === '/api/attendance/check-out' && method === 'POST') {
    if (admin) throw new Error('Only staff can check out their own shift.');
    const snap = await getDocs(query(attendance, where('userId', '==', user.uid), where('workDate', '==', today)));
    const current = snap.docs.find(item => !item.data().checkOutAt);
    if (!current) throw new Error('There is no active shift to check out.');
    await updateDoc(current.ref, { checkOutAt: stamp, status: 'Completed', gpsStatus: 'stopped' });
    return { data: { updated: true } as T };
  }
  if ((pathOnly === '/api/attendance/admin-start' || pathOnly === '/api/attendance/admin-end') && method === 'POST') {
    if (!admin) throw new Error('Only administrators can manage another staff member’s attendance.');
    const staffId = clean(payload?.userId, 128);
    const staffSnap = await getDoc(doc(firestore, 'users', staffId));
    if (!staffSnap.exists() || staffSnap.data().role !== 'staff' || staffSnap.data().active !== true) throw new Error('Choose an active staff member.');
    const todays = await getDocs(query(attendance, where('userId', '==', staffId), where('workDate', '==', today)));
    const existing = todays.docs[0];
    if (pathOnly.endsWith('admin-start')) {
      const startedAt = stamp;
      if (existing) {
        if (!existing.data().gpsRestartRequired) throw new Error('Attendance is already recorded for this staff member today.');
        await updateDoc(existing.ref, {
          checkInAt: startedAt, checkOutAt: null, status: 'Checked in',
          gpsCancelled: false, gpsRestartRequired: false, gpsStatus: 'active',
          gpsIssueStartedAt: null, gpsIssueId: null, gpsIssueReason: null,
          restartedByAdmin: profile.displayName, restartedAt: startedAt
        });
        return { data: { id: existing.id, restarted: true } as T };
      }
      const id = 'att-' + staffId + '-' + today;
      const record = {
        userId: staffId, displayName: clean(staffSnap.data().displayName, 80), workDate: today,
        checkInAt: startedAt, status: 'Checked in', dayType: payload?.dayType === 'Half day' ? 'Half day' : 'Full day',
        startedByAdmin: profile.displayName, attendanceSource: 'Admin', gpsStatus: 'active'
      };
      await setDoc(doc(firestore, 'attendance', id), record);
      return { data: { id, ...record } as T };
    }
    if (!existing || existing.data().checkOutAt) throw new Error('There is no active shift to end for this staff member.');
    await updateDoc(existing.ref, { checkOutAt: stamp, status: 'Completed', gpsStatus: 'stopped', endedByAdmin: profile.displayName });
    return { data: { updated: true } as T };
  }
  if (pathOnly.startsWith('/api/attendance/') && pathOnly.endsWith('/day-type') && method === 'PUT') {
    if (!admin) throw new Error('Only administrators can correct attendance.');
    const id = decodeURIComponent(pathOnly.slice('/api/attendance/'.length, -'/day-type'.length));
    const dayType = payload?.dayType === 'Half day' ? 'Half day' : payload?.dayType === 'Full day' ? 'Full day' : '';
    const reason = clean(payload?.reason, 300);
    if (!dayType || !reason) throw new Error('Choose Full day or Half day and enter a correction reason.');
    await updateDoc(doc(firestore, 'attendance', id), { dayType, correctionReason: reason, correctedBy: user.uid, correctedAt: stamp });
    return { data: { updated: true } as T };
  }
  if (pathOnly === '/api/attendance/gps-lost' && method === 'POST') {
    if (admin) throw new Error('Only staff devices can report their own GPS status.');
    const reason = clean(payload?.reason, 160);
    if (!['Location permission denied', 'Phone location services are unavailable', 'GPS location unavailable', 'Location permission was turned off'].includes(reason)) {
      throw new Error('GPS grace tracking starts only when location permission or phone location services are unavailable.');
    }
    const snap = await getDocs(query(attendance, where('userId', '==', user.uid), where('workDate', '==', today)));
    const active = snap.docs.find(item => !item.data().checkOutAt && !item.data().gpsRestartRequired);
    if (!active) return { data: { monitoring: false, reason: 'no-active-shift' } as T };
    const startedAt = String(active.data().gpsIssueStartedAt || stamp);
    const deadlineAt = new Date(new Date(startedAt).getTime() + 15 * 60 * 1000).toISOString();
    if (!active.data().gpsIssueStartedAt) {
      await updateDoc(active.ref, { gpsIssueStartedAt: startedAt, gpsStatus: 'grace-period', gpsIssueReason: reason });
    }
    return { data: { monitoring: true, cancelled: false, startedAt, deadlineAt, remainingSeconds: Math.max(0, Math.ceil((new Date(deadlineAt).getTime() - Date.now()) / 1000)), enforcement: 'foreground-only-on-spark' } as T };
  }
  if (pathOnly === '/api/locations' && method === 'GET') {
    if (!admin) throw new Error('Only administrators can view team locations.');
    const [locationSnap, shiftSnap] = await Promise.all([getDocs(locations), getDocs(query(attendance, where('workDate', '==', today)))]);
    const activeIds = new Set(shiftSnap.docs.filter(item => !item.data().checkOutAt && !item.data().gpsRestartRequired).map(item => String(item.data().userId)));
    const latest = new Map<string, any>();
    for (const item of locationSnap.docs) {
      const point = { id: item.id, ...item.data() } as any;
      if (!activeIds.has(String(point.userId))) continue;
      const old = latest.get(String(point.userId));
      if (!old || String(point.capturedAt || '') > String(old.capturedAt || '')) latest.set(String(point.userId), point);
    }
    return { data: { items: Array.from(latest.values()) } as T };
  }
  if (pathOnly === '/api/locations/history' && method === 'GET') {
    if (!admin) throw new Error('Only administrators can view location history.');
    const snap = await getDocs(locations);
    const items = snap.docs.map(item => ({ id: item.id, ...item.data() })).sort((a: any,b: any) => String(b.capturedAt || '').localeCompare(String(a.capturedAt || ''))).slice(0, 500);
    return { data: { items } as T };
  }
  if (pathOnly === '/api/locations' && method === 'POST') {
    if (admin) throw new Error('Only staff devices can share staff location.');
    const coords = validCoords(payload || {});
    const snap = await getDocs(query(attendance, where('userId', '==', user.uid), where('workDate', '==', today)));
    const active = snap.docs.find(item => !item.data().checkOutAt && !item.data().gpsRestartRequired);
    if (!active) throw new Error('Location can be shared only during an active shift.');
    const issueStartedAt = active.data().gpsIssueStartedAt ? new Date(String(active.data().gpsIssueStartedAt)).getTime() : null;
    if (issueStartedAt !== null && Date.now() - issueStartedAt >= 15 * 60 * 1000) {
      throw new Error('The 15-minute GPS grace window has elapsed. Contact an administrator to review your shift.');
    }
    const locationRef = doc(locations);
    const capturedAt = clean(payload?.capturedAt, 40) || stamp;
    const batch = writeBatch(firestore);
    batch.set(locationRef, { ...coords, userId: user.uid, displayName: profile.displayName, attendanceId: active.id, capturedAt });
    const patch: Record<string, unknown> = { gpsStatus: 'active' };
    if (issueStartedAt !== null) {
      patch.gpsIssueStartedAt = null;
      patch.gpsIssueReason = null;
      patch.gpsRestoredAt = stamp;
    }
    batch.update(active.ref, patch);
    await batch.commit();
    return { data: { id: locationRef.id, saved: true, gpsRestored: issueStartedAt !== null } as T };
  }
  throw new Error('Unsupported attendance or location request.');
}

async function request<T = any>(path: string, method: string, payload?: Record<string, unknown>): Promise<ApiResult<T>> {
  if (path.split('?')[0] === '/api/plans' || path.split('?')[0].startsWith('/api/plans/')) return requestPlans<T>(path, method, payload);
  if (path.split('?')[0] === '/api/customers' || path.split('?')[0].startsWith('/api/customers/')) return requestCustomers<T>(path, method, payload);
  if (path.split('?')[0] === '/api/payments' || path.split('?')[0].startsWith('/api/payments/')) return requestPayments<T>(path, method, payload);
  if (path.split('?')[0] === '/api/tasks' || path.split('?')[0].startsWith('/api/tasks/')) return requestTasks<T>(path, method, payload);
  if (path.split('?')[0] === '/api/complaints' || path.split('?')[0].startsWith('/api/complaints/')) return requestComplaints<T>(path, method, payload);
  if (path.split('?')[0] === '/api/subscriptions' || path.split('?')[0].startsWith('/api/subscriptions/')) return requestSubscriptions<T>(path, method, payload);
  if (path.split('?')[0].startsWith('/api/attendance') || path.split('?')[0] === '/api/locations' || path.split('?')[0] === '/api/locations/history') return requestAttendance<T>(path, method, payload);
  if (!firebaseAuth) throw new Error('Firebase is not configured yet. Add the K&B Firebase web app settings before signing in.');
  const auth = firebaseAuth;
  if (!auth.currentUser) await new Promise<void>(resolve => {
    let unsubscribe = () => {};
    unsubscribe = onAuthStateChanged(auth, () => { unsubscribe(); resolve(); });
  });
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Please sign in again to continue.');
  const token = await currentUser.getIdToken();
  const url = new URL(path, API_BASE);
  url.searchParams.delete('sessionToken');
  const headers: Record<string, string> = { Authorization: 'Bearer ' + token };
  let body: string | undefined;
  if (payload) {
    const safePayload = { ...payload };
    delete safePayload.sessionToken;
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(safePayload);
  }
  const response = await fetch(url.toString(), { method, headers, body, cache: 'no-store' });
  let data: any = {};
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'The request could not be completed. Please try again.');
  return { data };
}
export async function nativeApiPost<T = any>(path: string, payload: Record<string, unknown>): Promise<ApiResult<T>> {
  if (!firebaseAuth?.currentUser) throw new Error('Please sign in again to continue location sharing.');
  const token = await firebaseAuth.currentUser.getIdToken();
  const url = new URL(path, API_BASE);
  url.searchParams.delete('sessionToken');
  const response = await CapacitorHttp.post({
    url: url.toString(),
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    data: payload,
    connectTimeout: 15000,
    readTimeout: 15000
  });
  const data: any = response.data || {};
  if (response.status < 200 || response.status >= 300) {
    const error = new Error(typeof data.error === 'string' ? data.error : 'The location update could not be sent.') as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return { data: data as T };
}
export async function submitStaffRegistrationRequest(input: { userId: string; displayName: string; phone?: string; reason?: string }) {
  const url = new URL('/api/staff-registration-requests', API_BASE);
  const response = await fetch(url.toString(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), cache: 'no-store' });
  let data: any = {};
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Could not submit your staff registration request.');
  return data as { id: string; trackingCode: string; status: 'pending'; message: string };
}

export async function getStaffRegistrationStatus(requestId: string, trackingCode: string) {
  const url = new URL('/api/staff-registration-requests/status', API_BASE);
  url.searchParams.set('requestId', requestId);
  url.searchParams.set('trackingCode', trackingCode);
  const response = await fetch(url.toString(), { method: 'GET', cache: 'no-store' });
  let data: any = {};
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Could not check registration status.');
  return data as { status: 'pending'|'approved'|'rejected'; createdAt: string; reviewedAt?: string | null; reviewedByName?: string | null };
}
export type AppUserProfile = { id: string; userId: string; displayName: string; role: 'admin' | 'staff'; active: boolean; isSuperAdmin?: boolean };

// Read the signed-in user's own profile directly from Firestore. This removes
// the Cloud Functions dependency from the sign-in/profile bootstrap path.
export async function getAppUserProfile(): Promise<AppUserProfile> {
  const user = firebaseAuth?.currentUser;
  if (!user || !firestore) throw new Error('Please sign in again to continue.');
  const snapshot = await getDoc(doc(firestore, 'users', user.uid));
  if (!snapshot.exists()) throw new Error('This Firebase account has no K&B staff profile yet. Ask the administrator to provision it.');
  const data = snapshot.data();
  if (data.active !== true || (data.role !== 'admin' && data.role !== 'staff')) {
    throw new Error('This K&B account is not active. Contact the administrator.');
  }
  return {
    id: user.uid,
    userId: String(data.userId || ''),
    displayName: String(data.displayName || ''),
    role: data.role,
    active: true,
    isSuperAdmin: data.role === 'admin' && data.isSuperAdmin === true,
  };
}

export const api = {
  get: <T = any>(path: string) => request<T>(path, 'GET'),
  post: <T = any>(path: string, payload?: Record<string, unknown>) => request<T>(path, 'POST', payload),
  put: <T = any>(path: string, payload?: Record<string, unknown>) => request<T>(path, 'PUT', payload),
  delete: <T = any>(path: string) => request<T>(path, 'DELETE'),
};
export async function bootstrapAdmin(bootstrapSecret: string, password: string) {
  const url = new URL('/api/auth/bootstrap-admin', API_BASE);
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bootstrapSecret, password }),
    cache: 'no-store',
  });
  let data: any = {};
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Initial admin setup failed.');
  return data;
}
export async function recoverAdminPassword(recoveryCode: string, newPassword: string) {
  const url = new URL('/api/auth/recover-admin', API_BASE);
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: 'Brajraj', recoveryCode, newPassword }),
    cache: 'no-store',
  });
  let data: any = {};
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Admin password recovery failed.');
  return data;
}
function firebaseSignInError(error: unknown): Error {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code || '')
    : '';
  const messages: Record<string, string> = {
    'auth/invalid-credential': 'Firebase rejected this user ID or password. Check the password, and confirm that the matching account has been created in Firebase Authentication. Old-system passwords are not automatically imported.',
    'auth/user-not-found': 'This account does not exist in Firebase Authentication yet. The project owner must provision the existing Brajraj account, or an admin must create this staff account.',
    'auth/wrong-password': 'The password is incorrect for this Firebase account.',
    'auth/configuration-not-found': 'Firebase Authentication has not been initialized for project kandb-net-sevice, or it has no Email/Password provider configuration. The project owner must open Firebase Console → Authentication, choose Get started if shown, then enable Email/Password under Sign-in method.',
    'auth/operation-not-allowed': 'Email/Password sign-in is disabled in Firebase Console. The project owner must enable Authentication → Sign-in method → Email/Password.',
    'auth/invalid-api-key': 'The APK has an invalid Firebase API key. Rebuild it with the Web App configuration from project kandb-net-sevice.',
    'auth/app-not-authorized': 'This Firebase app is not authorized for the configured API key. Check the Firebase project Web App configuration and API key restrictions.',
    'auth/unauthorized-domain': 'Firebase rejected this app domain. Check Authentication → Settings → Authorized domains for the configured Firebase project.',
    'auth/network-request-failed': 'Firebase could not be reached. Check the phone internet connection, date and time, then try again.',
    'auth/too-many-requests': 'Firebase temporarily blocked sign-in attempts. Wait a while before trying again.',
    'auth/invalid-email': 'The generated Firebase account email is invalid. Check the user ID and account configuration.',
  };
  const message = messages[code] || (error instanceof Error ? error.message : 'Firebase sign-in failed. Check the Firebase project configuration and account setup.');
  const result = new Error(message) as Error & { code?: string };
  if (code) result.code = code;
  return result;
}

export async function signInAppUser(userId: string, password: string) {
  if (!firebaseAuth) throw new Error('Firebase is not configured in this APK. Rebuild it with the Web App settings for project kandb-net-sevice.');
  const id = userId.trim().toLowerCase();
  if (!id) throw new Error('Enter your user ID.');
  try {
    // Keep the Firebase session available after Android closes and reopens the app.
    await setPersistence(firebaseAuth, browserLocalPersistence);
    await signInWithEmailAndPassword(firebaseAuth, id + '@' + ACCOUNT_DOMAIN, password);
  } catch (error) {
    throw firebaseSignInError(error);
  }
  try {
    const currentUser = firebaseAuth.currentUser;
    if (!currentUser) throw new Error('Firebase sign-in completed but no authenticated user session was returned. Please sign in again.');
    const token = await currentUser.getIdToken();
    const profile = await getAppUserProfile();
    return { token, expiresAt: Date.now() + 3600000, user: profile };
  } catch (error) {
    await signOut(firebaseAuth);
    const detail = error instanceof Error ? error.message : 'Unknown server response.';
    throw new Error('Firebase accepted the sign-in, but the K&B account profile could not be loaded: ' + detail);
  }
}
export async function changeAppUserId(currentPassword: string, newUserId: string) {
  if (!firebaseAuth?.currentUser?.email) throw new Error('Please sign in again to change your user ID.');
  const userId = newUserId.trim();
  if (!/^[a-zA-Z0-9_-]{3,32}$/.test(userId)) throw new Error('Use 3–32 letters, numbers, underscores or hyphens.');
  const user = firebaseAuth.currentUser;
  const email = user.email;
  if (!email) throw new Error('This account does not have a sign-in email. Contact an administrator.');
  const credential = EmailAuthProvider.credential(email, currentPassword);
  await reauthenticateWithCredential(user, credential);
  await api.post('/api/auth/change-user-id', { userId });
  await signOut(firebaseAuth);
}
export async function changeAppPassword(currentPassword: string, newPassword: string) {
  if (!firebaseAuth?.currentUser?.email) throw new Error('Please sign in again to change your password.');
  if (newPassword.length < 10) throw new Error('Choose a password with at least 10 characters.');
  const user = firebaseAuth.currentUser;
  const email = user.email;
  if (!email) throw new Error('This account does not have a sign-in email. Contact an administrator.');
  const credential = EmailAuthProvider.credential(email, currentPassword);
  await reauthenticateWithCredential(user, credential);
  await user.getIdToken(true);
  await api.post('/api/auth/change-password', { newPassword });
  await signOut(firebaseAuth);
}
export async function signOutAppUser() { if (firebaseAuth) await signOut(firebaseAuth); }
export const ws = {
  connect() {
    return { connectionId: undefined as string | undefined, ready: Promise.resolve(), onMessage(_callback: (message: any) => void) {}, disconnect() {} };
  },
};
