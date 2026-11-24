import { ai, router, json, db, storage, secrets } from '@appdeploy/sdk';

type AdvisorMessage = { role: 'user' | 'assistant'; content: string };
type PortalPlan = {
  id: string;
  name: string;
  price: number;
  speed: string;
  data: string;
  validity: string;
  tag: string;
  color: 'blue' | 'purple' | 'cyan';
  features: string[];
  active?: boolean;
  featured?: boolean;
  offerLabel?: string;
  tagline?: string;
  idealFor?: string;
};
type PortalImage = { src: string; path?: string; alt?: string };
type PortalContent = {
  plans: PortalPlan[];
  heroImages: PortalImage[];
  promo: { active: boolean; badge: string; title: string; body: string; cta: string };
};

const MANAGEMENT_API_BASE = 'https://kandb-management-nexus-api-zv7f.onrender.com';

const defaultContent: PortalContent = {
  plans: [
    { id: 'p3', name: 'K&B Connect 30', price: 399, speed: '30 Mbps', data: '1 TB', validity: '30 days', tagline: 'Simple, dependable internet for every day', idealFor: 'Browsing, study, messaging and everyday use', tag: 'EVERYDAY CONNECT', color: 'cyan', features: ['Everyday browsing and social apps', 'Online study and video calls', '1 TB monthly data allowance'], active: true, featured: false, offerLabel: '' },
    { id: 'p1', name: 'K&B Stream 50', price: 499, speed: '50 Mbps', data: '1.5 TB', validity: '30 days', tagline: 'Your family’s all-round entertainment connection', idealFor: 'Family browsing, HD streaming, classes and work', tag: 'FAMILY FAVOURITE', color: 'blue', features: ['HD video streaming and online classes', 'Multiple connected devices', '1.5 TB monthly data allowance'], active: true, featured: true, offerLabel: '' },
    { id: 'p2', name: 'K&B Ultra 100', price: 699, speed: '100 Mbps', data: '2 TB', validity: '30 days', tagline: 'More speed for busy, connected homes', idealFor: 'Heavier usage and multiple simultaneous streams', tag: 'POWER PLAN', color: 'purple', features: ['100 Mbps broadband speed', 'Multiple simultaneous streams', '2 TB monthly data allowance'], active: true, featured: true, offerLabel: '' }
  ],
  heroImages: [
    { src: 'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?auto=format&fit=crop&w=1200&q=85', alt: 'Connected home router' },
    { src: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=1200&q=85', alt: 'Modern data centre' },
    { src: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=85', alt: 'Network technology' },
    { src: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1200&q=85', alt: 'Global digital connectivity' }
  ],
  promo: { active: true, badge: 'K&B CUSTOMER EXCLUSIVE', title: 'A better connection starts at home', body: 'Explore plans designed for everyday browsing, streaming, learning and work.', cta: 'Explore plans' }
};

async function readContent(): Promise<PortalContent> {
  const [saved] = await db.get<PortalContent>('portal_content', ['published'], { consistent: true });
  if (!saved) return defaultContent;
  return {
    plans: Array.isArray(saved.plans) ? saved.plans : defaultContent.plans,
    heroImages: Array.isArray(saved.heroImages) && saved.heroImages.length ? saved.heroImages : defaultContent.heroImages,
    promo: saved.promo || defaultContent.promo
  };
}

async function readManagementPlans(): Promise<PortalPlan[]> {
  const response = await fetch(MANAGEMENT_API_BASE + '/api/portal/plans', {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Management Nexus plan catalogue is unavailable.');
  const payload = await response.json() as { items?: Array<Record<string, unknown>> };
  if (!Array.isArray(payload.items)) throw new Error('Management Nexus returned an invalid plan catalogue.');
  return payload.items.map(item => ({
    id: String(item.id || ''),
    name: String(item.name || ''),
    price: Number(item.price || 0),
    speed: String(item.speed || ''),
    data: String(item.data || ''),
    validity: String(item.validity || '30 days'),
    tagline: String(item.tagline || ''),
    idealFor: String(item.idealFor || ''),
    tag: String(item.tag || 'K&B PLAN'),
    color: item.color === 'cyan' || item.color === 'purple' ? item.color : 'blue',
    features: Array.isArray(item.features) ? item.features.filter((value): value is string => typeof value === 'string').slice(0, 6) : [],
    active: true,
    featured: item.featured === true,
    offerLabel: '',
  })).filter(plan => plan.id && plan.name && Number.isFinite(plan.price) && plan.price > 0);
}

async function readPortalContent(): Promise<PortalContent> {
  const [content, plans] = await Promise.all([readContent(), readManagementPlans()]);
  return { ...content, plans };
}

async function withFreshImageUrls(content: PortalContent): Promise<PortalContent> {
  const paths = content.heroImages.filter(image => image.path).map(image => image.path as string);
  if (!paths.length) return content;
  const signed = await storage.url(paths);
  const urlByPath = new Map(signed.map(item => [item.path, item.url]));
  return {
    ...content,
    heroImages: content.heroImages.map(image => image.path
      ? { ...image, src: urlByPath.get(image.path) || image.src }
      : image)
  };
}

async function requireAdmin(token: unknown) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return false;
  const [session] = await db.get<{ expiresAt: number }>('portal_admin_sessions', [token], { consistent: true });
  return !!session && Number(session.expiresAt) > Date.now();
}

async function verifyManagementAdmin(managementToken: unknown) {
  if (typeof managementToken !== 'string' || !/^[a-f0-9]{64}$/.test(managementToken)) return false;
  try {
    const response = await fetch(MANAGEMENT_API_BASE + '/api/auth/me', {
      headers: { Authorization: 'Bearer ' + managementToken, Accept: 'application/json' },
      signal: AbortSignal.timeout(12000), cache: 'no-store',
    });
    const identity = await response.json().catch(() => ({})) as { user?: { role?: string; active?: boolean } };
    return response.ok && identity.user?.role === 'admin' && identity.user.active !== false;
  } catch { return false; }
}

async function managementPlanRequest(method: string, path: string, managementToken: string, body?: unknown) {
  return fetch(MANAGEMENT_API_BASE + path, {
    method,
    headers: { Authorization: 'Bearer ' + managementToken, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000), cache: 'no-store',
  });
}

function validContent(value: unknown): value is PortalContent {
  if (!value || typeof value !== 'object') return false;
  const content = value as PortalContent;
  if (!Array.isArray(content.plans) || content.plans.length < 1 || content.plans.length > 30) return false;
  if (!Array.isArray(content.heroImages) || content.heroImages.length > 12) return false;
  if (!content.promo || typeof content.promo.title !== 'string' || typeof content.promo.body !== 'string') return false;
  const ids = new Set<string>();
  for (const plan of content.plans) {
    if (!plan || typeof plan.id !== 'string' || !plan.id || ids.has(plan.id)) return false;
    ids.add(plan.id);
    if (typeof plan.name !== 'string' || !plan.name.trim() || plan.name.length > 80) return false;
    if (!Number.isFinite(plan.price) || plan.price < 1 || plan.price > 100000) return false;
    if (typeof plan.speed !== 'string' || plan.speed.length > 40 || typeof plan.data !== 'string' || plan.data.length > 60 || typeof plan.validity !== 'string' || plan.validity.length > 40) return false;
    if (plan.tagline !== undefined && (typeof plan.tagline !== 'string' || plan.tagline.length > 100)) return false;
    if (plan.idealFor !== undefined && (typeof plan.idealFor !== 'string' || plan.idealFor.length > 140)) return false;
    if (typeof plan.tag !== 'string' || plan.tag.length > 24 || !['blue', 'purple', 'cyan'].includes(plan.color)) return false;
    if (!Array.isArray(plan.features) || plan.features.length > 6 || plan.features.some(item => typeof item !== 'string' || item.length > 160)) return false;
    if (plan.offerLabel && plan.offerLabel.length > 24) return false;
  }
  for (const image of content.heroImages) {
    if (!image || typeof image.src !== 'string' || image.src.length > 3000) return false;
    if (image.path && !/^portal-media\/[a-f0-9-]+\.(jpg|png|webp)$/.test(image.path)) return false;
    if (!image.path && !/^https:\/\//i.test(image.src)) return false;
  }
  return true;
}

async function saveContent(content: PortalContent) {
  const [existing] = await db.get<PortalContent>('portal_content', ['published'], { consistent: true });
  const record = { heroImages: content.heroImages, promo: content.promo };
  if (existing) {
    const [updated] = await db.update('portal_content', [{ id: 'published', record }]);
    if (!updated) throw new Error('The content record could not be updated.');
  } else {
    const [created] = await db.tx.add('portal_content', [{ id: 'published', ...record }]);
    if (!created) {
      const [updated] = await db.update('portal_content', [{ id: 'published', record }]);
      if (!updated) throw new Error('The content record could not be created.');
    }
  }
}

function makeToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
}

const planCatalogue = [
  { name: 'K&B Connect 30', monthlyPriceBeforeTax: 399, speed: '30 Mbps', monthlyData: '1 TB', validity: '30 days', suitableFor: 'Browsing, study, messaging and everyday use' },
  { name: 'K&B Stream 50', monthlyPriceBeforeTax: 499, speed: '50 Mbps', monthlyData: '1.5 TB', validity: '30 days', suitableFor: 'Family browsing, HD streaming, classes and work' },
  { name: 'K&B Ultra 100', monthlyPriceBeforeTax: 699, speed: '100 Mbps', monthlyData: '2 TB', validity: '30 days', suitableFor: 'Heavier usage and multiple simultaneous streams' }
];

export const handler = router({
  'GET /api/_healthcheck': [async () => json({ message: 'Success' })],
  'GET /api/portal-content': [async () => {
    try {
      const content = await readPortalContent();
      return json({ ...(await withFreshImageUrls(content)), planSource: 'management-nexus' });
    } catch {
      const fallback = await withFreshImageUrls(await readContent());
      return json({ ...fallback, planSource: 'legacy-fallback', integrationPending: true });
    }
  }],
  'POST /api/management/connection-requests': [async ({ body }) => {
    try {
      const response = await fetch(MANAGEMENT_API_BASE + '/api/portal/connection-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body || {}),
        signal: AbortSignal.timeout(15000),
      });
      const payload = await response.json().catch(() => ({ error: 'K&B could not process this request.' }));
      if (response.status === 404) return json({ error: 'The K&B request intake is being connected. Please call 079-29992999 to arrange a new connection for now.' }, 503);
      return json(payload, response.status);
    } catch {
      return json({ error: 'K&B Management Nexus is temporarily unavailable. Your request was not submitted. Please try again.' }, 503);
    }
  }],
  'POST /api/management/complaints': [async ({ body }) => {
    try {
      const response = await fetch(MANAGEMENT_API_BASE + '/api/portal/complaints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body || {}),
        signal: AbortSignal.timeout(20000),
      });
      const payload = await response.json().catch(() => ({ error: 'K&B could not process this support request.' }));
      if (response.status === 404) return json({ error: 'K&B support intake is temporarily unavailable. Please call 079-29992999.' }, 503);
      return json(payload, response.status);
    } catch {
      return json({ error: 'K&B Management Nexus is temporarily unavailable. Your support request was not submitted. Please try again.' }, 503);
    }
  }],
  'GET /api/admin/management/plans': [async ({ query }) => {
    const managementToken = String(query.managementToken || '');
    if (!await verifyManagementAdmin(managementToken)) return json({ error: 'Your Management Nexus admin session has expired. Open Portal Control again from Management Nexus.' }, 401);
    try {
      const response = await managementPlanRequest('GET', '/api/plans', managementToken);
      const payload = await response.json().catch(() => ({}));
      return json(payload, response.status);
    } catch { return json({ error: 'Management Nexus plan catalogue is temporarily unavailable.' }, 503); }
  }],
  'POST /api/admin/management/plans': [async ({ body }) => {
    const request = body as { managementToken?: string; plan?: Record<string, unknown> };
    if (!await verifyManagementAdmin(request?.managementToken)) return json({ error: 'Your Management Nexus admin session has expired. Open Portal Control again from Management Nexus.' }, 401);
    try {
      const response = await managementPlanRequest('POST', '/api/plans', String(request.managementToken), request.plan || {});
      const payload = await response.json().catch(() => ({}));
      return json(payload, response.status);
    } catch { return json({ error: 'Could not create the plan because Management Nexus is unavailable.' }, 503); }
  }],
  'PUT /api/admin/management/plans/:id': [async ({ params, body }) => {
    const request = body as { managementToken?: string; plan?: Record<string, unknown> };
    if (!await verifyManagementAdmin(request?.managementToken)) return json({ error: 'Your Management Nexus admin session has expired. Open Portal Control again from Management Nexus.' }, 401);
    try {
      const response = await managementPlanRequest('PUT', '/api/plans/' + encodeURIComponent(params.id), String(request.managementToken), request.plan || {});
      const payload = await response.json().catch(() => ({}));
      return json(payload, response.status);
    } catch { return json({ error: 'Could not update the plan because Management Nexus is unavailable.' }, 503); }
  }],
  'DELETE /api/admin/management/plans/:id': [async ({ params, query }) => {
    const managementToken = String(query.managementToken || '');
    if (!await verifyManagementAdmin(managementToken)) return json({ error: 'Your Management Nexus admin session has expired. Open Portal Control again from Management Nexus.' }, 401);
    try {
      const response = await managementPlanRequest('DELETE', '/api/plans/' + encodeURIComponent(params.id), managementToken);
      const payload = await response.json().catch(() => ({}));
      return json(payload, response.status);
    } catch { return json({ error: 'Could not delete the plan because Management Nexus is unavailable.' }, 503); }
  }],
  'POST /api/admin/management-sso': [async ({ body }) => {
    const request = body as { managementToken?: string };
    const managementToken = typeof request?.managementToken === 'string' ? request.managementToken : '';
    if (!/^[a-f0-9]{64}$/.test(managementToken)) return json({ error: 'The management admin session is missing or invalid.' }, 401);
    try {
      const response = await fetch(MANAGEMENT_API_BASE + '/api/auth/me', {
        headers: { Authorization: 'Bearer ' + managementToken, Accept: 'application/json' },
        signal: AbortSignal.timeout(12000),
        cache: 'no-store',
      });
      const identity = await response.json().catch(() => ({})) as { user?: { role?: string } };
      if (!response.ok || identity.user?.role !== 'admin') return json({ error: 'Only a signed-in Management Nexus administrator can open Customer Portal Control.' }, 403);
      const token = makeToken();
      const expiresAt = Date.now() + 8 * 60 * 60 * 1000;
      const [created] = await db.tx.add('portal_admin_sessions', [{ id: token, expiresAt }]);
      if (!created) return json({ error: 'Could not create a secure portal session. Please try again.' }, 503);
      return json({ token, expiresAt });
    } catch {
      return json({ error: 'Management Nexus could not verify your admin session. Check the connection and try again.' }, 503);
    }
  }],
  'POST /api/admin/login': [async ({ body }) => {
    const request = body as { password?: string };
    if (!request || typeof request.password !== 'string' || request.password.length < 1) {
      return json({ error: 'Enter the admin password.' }, 400);
    }
    let configuredPassword = '';
    try {
      configuredPassword = await secrets.readSecret('CUSTOMER_PORTAL_ADMIN_PASSWORD');
    } catch {
      return json({ error: 'Admin password setup is not complete yet.' }, 503);
    }
    if (request.password !== configuredPassword) return json({ error: 'Incorrect admin password.' }, 401);
    const token = makeToken();
    const expiresAt = Date.now() + 8 * 60 * 60 * 1000;
    const [created] = await db.tx.add('portal_admin_sessions', [{ id: token, expiresAt }]);
    if (!created) return json({ error: 'Could not create a secure admin session. Please try again.' }, 503);
    return json({ token, expiresAt });
  }],
  'POST /api/admin/content/load': [async ({ body }) => {
    const request = body as { token?: string };
    if (!await requireAdmin(request?.token)) return json({ error: 'Admin session expired. Sign in again.' }, 401);
    const content = await withFreshImageUrls(await readPortalContent());
    return json({ content });
  }],
  'PUT /api/admin/content': [async ({ body }) => {
    const request = body as { token?: string; content?: unknown };
    if (!await requireAdmin(request?.token)) return json({ error: 'Admin session expired. Sign in again.' }, 401);
    if (!validContent(request.content)) return json({ error: 'Some plan, offer or image details are invalid. Review the fields and try again.' }, 400);
    await saveContent(request.content);
    const content = await withFreshImageUrls(await readPortalContent());
    return json({ saved: true, content });
  }],
  'POST /api/admin/image': [async ({ body }) => {
    const request = body as { token?: string; contentBase64?: string; contentType?: string; filename?: string };
    if (!await requireAdmin(request?.token)) return json({ error: 'Admin session expired. Sign in again.' }, 401);
    const allowed: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
    const extension = request.contentType ? allowed[request.contentType] : undefined;
    if (!extension || typeof request.contentBase64 !== 'string' || request.contentBase64.length < 100 || request.contentBase64.length > 7000000) {
      return json({ error: 'Choose a valid JPG, PNG or WebP image up to 5 MB.' }, 400);
    }
    const path = 'portal-media/' + makeToken().slice(0, 32) + '.' + extension;
    const [ok] = await storage.write([{ path, content: request.contentBase64, contentType: request.contentType as string }]);
    if (!ok) return json({ error: 'The image could not be saved. Try a smaller file.' }, 503);
    const [signed] = await storage.url([path]);
    return json({ image: { path, src: signed?.url || '', alt: 'K&B campaign image' } });
  }],
  'POST /api/admin/logout': [async ({ body }) => {
    const request = body as { token?: string };
    if (typeof request?.token === 'string' && /^[a-f0-9]{64}$/.test(request.token)) {
      await db.delete('portal_admin_sessions', [request.token]);
    }
    return json({ signedOut: true });
  }],
  'POST /api/plan-advisor': [async ({ body }) => {
    const request = body as { messages?: AdvisorMessage[]; customerName?: string };
    if (!request || !Array.isArray(request.messages) || request.messages.length === 0) {
      return json({ error: 'Please send a message to the plan advisor.' }, 400);
    }
    const messages = request.messages
      .filter((item): item is AdvisorMessage =>
        !!item && (item.role === 'user' || item.role === 'assistant') &&
        typeof item.content === 'string' && item.content.trim().length > 0)
      .slice(-10)
      .map(item => ({ role: item.role, content: item.content.slice(0, 1200) }));
    if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
      return json({ error: 'Please enter a valid question.' }, 400);
    }
    const system = [
      'You are the K&B NET SERVICE customer-help assistant. You support internet-plan advice, basic Wi-Fi troubleshooting, billing and invoice explanations, new-connection guidance, and general customer support.',
      'For plan advice, use only the exact current plan catalogue, prices, speeds, data allowances and validity supplied in this request. Never invent discounts, availability, taxes, service terms or extra plans.',
      'For Wi-Fi issues, guide customers through safe basic checks only. Never ask them to open equipment, handle exposed wiring or attempt electrical repairs.',
      'Use the live Management Nexus plan catalogue supplied with this request. Do not claim access to personal customer accounts, router telemetry, payments, installation schedules or support tickets unless those systems explicitly return that data.',
      'Never request passwords, OTPs, payment credentials or identity documents. Be concise, clear, friendly and non-pressuring.'
    ].join(' ');
    const promptMessages = [
      { role: 'system' as const, content: system + '\nCurrent Management Nexus plan catalogue: ' + JSON.stringify(await readManagementPlans()) },
      ...messages.map(item => ({ role: item.role as 'user' | 'assistant', content: item.content }))
    ];
    try {
      const result = await ai.generate({ messages: promptMessages, maxTokens: 420, temperature: 0.35, thinkingMode: 'FAST' });
      return json({ reply: result.text });
    } catch {
      return json({ error: 'The plan advisor is temporarily unavailable. Please try again.' }, 503);
    }
  }]
});
