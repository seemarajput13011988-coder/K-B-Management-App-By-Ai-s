import { useEffect, useState } from 'react';
import { api } from '@appdeploy/client';
import { CheckCircle2, ImagePlus, LogOut, Plus, Save, ShieldCheck, Upload, X } from 'lucide-react';
import '../admin-studio.css';
import type { PortalContent, PortalPlan } from '../data/portalContent';

type Props = {
  managementSessionToken?: string;
  initialContent: PortalContent;
  onPublished: (content: PortalContent) => void;
};

type ManagementPlan = {
  id: string; name: string; provider: string; speed: string; data: string; price: number;
  note: string; details: string; connectionType: string; featured: boolean; active: boolean;
};

const blankManagementPlan = (): ManagementPlan => ({
  id: '', name: '', provider: 'RailWire', speed: '30 Mbps', data: '1.5 TB', price: 549,
  note: '', details: '', connectionType: 'Fiber', featured: false, active: true,
});

const makeNewPlan = (index: number): PortalPlan => ({
  id: 'plan-' + Date.now().toString(36) + '-' + index,
  name: 'K&B Signature ' + (index + 1),
  price: 499,
  speed: '50 Mbps',
  data: '1.5 TB',
  validity: '30 days',
  tagline: 'A connection made for everyday life',
  idealFor: 'Browsing, streaming, learning and work',
  tag: 'NEW PLAN',
  color: 'blue',
  features: ['Reliable everyday connectivity', 'HD streaming and video calls', 'Monthly data allowance'],
  active: true,
  featured: false,
  offerLabel: ''
});

export default function AdminStudio({ managementSessionToken, initialContent, onPublished }: Props) {
  const [token, setToken] = useState('');
  const [managementToken, setManagementToken] = useState(managementSessionToken || '');
  const [managementPlans, setManagementPlans] = useState<ManagementPlan[]>([]);
  const [planDraft, setPlanDraft] = useState<ManagementPlan>(blankManagementPlan);
  const [password, setPassword] = useState('');
  const [draft, setDraft] = useState<PortalContent>(initialContent);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [imageUrl, setImageUrl] = useState('');

  const load = async (session: string) => {
    const response = await api.post('/api/admin/content/load', { token: session });
    const content = response.data?.content as PortalContent;
    setDraft(content);
    onPublished(content);
  };

  const loadManagementPlans = async (session: string) => {
    const response = await api.get('/api/admin/management/plans?managementToken=' + encodeURIComponent(session));
    if (response.status >= 400 || response.data?.error) throw new Error(response.data?.error || 'Could not load the live plan catalogue.');
    const items = Array.isArray(response.data?.items) ? response.data.items as ManagementPlan[] : [];
    setManagementPlans(items.map(plan => ({ ...plan, id: String(plan.id), price: Number(plan.price), note: plan.note || '', details: plan.details || '', active: plan.active !== false, featured: plan.featured === true })));
  };

  const saveEditedPlan = async (source: ManagementPlan) => {
    if (!managementToken) return;
    const plan = { ...source, price: Number(source.price) };
    if (!plan.name.trim() || !plan.provider.trim() || !plan.speed.trim() || !plan.data.trim() || !plan.connectionType.trim() || !Number.isFinite(plan.price) || plan.price < 0) {
      setMessage('Complete the plan name, provider, speed, data, connection type and a valid price.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const response = await api.put('/api/admin/management/plans/' + encodeURIComponent(plan.id), { managementToken, plan });
      if (response.status >= 400 || response.data?.error) throw new Error(response.data?.error || 'Plan could not be saved.');
      await loadManagementPlans(managementToken);
      setMessage('Plan saved to Management Nexus and synchronised to the customer portal.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save this plan.');
    } finally {
      setBusy(false);
    }
  };

  const saveNewPlan = async () => {
    if (!managementToken) return;
    const plan = { ...planDraft, price: Number(planDraft.price) };
    if (!plan.name.trim() || !plan.provider.trim() || !plan.speed.trim() || !plan.data.trim() || !plan.connectionType.trim() || !Number.isFinite(plan.price) || plan.price < 0) {
      setMessage('Complete the plan name, provider, speed, data, connection type and a valid price.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const response = await api.post('/api/admin/management/plans', { managementToken, plan });
      if (response.status >= 400 || response.data?.error) throw new Error(response.data?.error || 'Plan could not be created.');
      await loadManagementPlans(managementToken);
      setPlanDraft(blankManagementPlan());
      setMessage('New plan added to Management Nexus and the customer portal.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not create this plan.');
    } finally {
      setBusy(false);
    }
  };

  const archiveManagementPlan = async (plan: ManagementPlan) => {
    if (!managementToken) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await api.put('/api/admin/management/plans/' + encodeURIComponent(plan.id), { managementToken, plan: { ...plan, active: false } });
      if (response.status >= 400 || response.data?.error) throw new Error(response.data?.error || 'Plan could not be archived.');
      await loadManagementPlans(managementToken);
      setMessage('Plan archived. Existing customer records and plan history are preserved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not archive this plan.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (managementSessionToken) {
      setBusy(true);
      api.post('/api/admin/management-sso', { managementToken: managementSessionToken }).then(async response => {
        const session = String(response.data?.token || '');
        if (!session) throw new Error('The management admin session could not be verified.');
        setManagementToken(managementSessionToken);
        window.localStorage.setItem('kb-portal-admin-session', session);
        await load(session);
        await loadManagementPlans(managementSessionToken);
        setToken(session);
      }).catch(error => {
        setMessage(error instanceof Error ? error.message : 'Could not open Customer Portal Control.');
      }).finally(() => setBusy(false));
      return;
    }
    const saved = window.localStorage.getItem('kb-portal-admin-session');
    if (!saved) return;
    setBusy(true);
    load(saved).then(async () => {
      setToken(saved);
      if (managementToken) await loadManagementPlans(managementToken);
    }).catch(() => {
      window.localStorage.removeItem('kb-portal-admin-session');
    }).finally(() => setBusy(false));
  }, [managementSessionToken]);

  const signIn = async () => {
    if (!password) {
      setMessage('Enter the admin password.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const response = await api.post('/api/admin/login', { password });
      const session = String(response.data?.token || '');
      if (!session) throw new Error('Admin session was not created.');
      window.localStorage.setItem('kb-portal-admin-session', session);
      await load(session);
      setToken(session);
      setPassword('');
      setMessage('Secure admin session opened.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Sign-in failed. Check the admin password.');
    } finally {
      setBusy(false);
    }
  };

  const updatePlan = (id: string, patch: Partial<PortalPlan>) => {
    setDraft(current => ({
      ...current,
      plans: current.plans.map(plan => plan.id === id ? { ...plan, ...patch } : plan)
    }));
  };

  const addPlan = () => {
    if (draft.plans.length >= 30) {
      setMessage('The catalogue can contain up to 30 plans.');
      return;
    }
    setDraft(current => ({ ...current, plans: [...current.plans, makeNewPlan(current.plans.length)] }));
    setMessage('New plan added. Edit its details, then publish.');
  };

  const removePlan = (id: string) => {
    if (draft.plans.length <= 1) {
      setMessage('Keep at least one plan in the catalogue.');
      return;
    }
    setDraft(current => ({ ...current, plans: current.plans.filter(plan => plan.id !== id) }));
    setMessage('Plan removed from the draft. Publish to apply the change.');
  };

  const save = async () => {
    if (!token) return;
    if (draft.plans.some(plan => !plan.name.trim() || !plan.speed.trim() || !plan.data.trim() || !plan.validity.trim())) {
      setMessage('Every plan needs a name, speed, data allowance and validity.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const response = await api.put('/api/admin/content', { token, content: draft });
      const saved = response.data?.content as PortalContent;
      setDraft(saved);
      onPublished(saved);
      setMessage('Campaign content and promotional images published. Live plan details remain controlled by Management Nexus.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save changes.');
    } finally {
      setBusy(false);
    }
  };

  const addImageUrl = () => {
    const value = imageUrl.trim();
    if (!/^https:\/\//i.test(value)) {
      setMessage('Use a complete HTTPS image address.');
      return;
    }
    setDraft(current => ({
      ...current,
      heroImages: [...current.heroImages, { src: value, alt: 'K&B broadband promotion' }]
    }));
    setImageUrl('');
  };

  const uploadImage = async (file?: File) => {
    if (!file || !token) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setMessage('Choose a JPG, PNG or WebP image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMessage('Each image must be 5 MB or smaller.');
      return;
    }
    setBusy(true);
    setMessage('Uploading image…');
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Image could not be read.'));
        reader.onerror = () => reject(new Error('Image could not be read.'));
        reader.readAsDataURL(file);
      });
      const contentBase64 = dataUrl.split(',')[1] || '';
      const response = await api.post('/api/admin/image', {
        token,
        contentBase64,
        contentType: file.type,
        filename: file.name
      });
      const image = response.data?.image;
      if (!image?.path) throw new Error('Image upload was not confirmed.');
      setDraft(current => ({
        ...current,
        heroImages: [...current.heroImages, image]
      }));
      setMessage('Image uploaded. Save changes to publish it in the carousel.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Image upload failed.');
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    try {
      await api.post('/api/admin/logout', { token });
    } catch {
      // Local sign-out still clears this browser session.
    }
    window.localStorage.removeItem('kb-portal-admin-session');
    setToken('');
    setManagementToken('');
    setManagementPlans([]);
    setDraft(initialContent);
    setMessage('Admin session closed.');
  };

  if (!token) {
    return (
      <div className="modal-content kb-admin-shell">
        <div className="kb-admin-login-mark"><ShieldCheck size={26} /></div>
        <h3>Protected admin access</h3>
        <p>Sign in to manage customer-facing campaign banners and promotional images. Plan names, prices, speed and availability are controlled centrally in Management Nexus.</p>
        <label htmlFor="kb-admin-password">Admin password</label>
        <input
          id="kb-admin-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={event => setPassword(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') signIn(); }}
          placeholder="Enter your secure admin password"
        />
        <button className="primary-button full" onClick={signIn} disabled={busy}>
          <ShieldCheck size={17} /> {busy ? 'Checking access…' : 'Sign in to Admin Studio'}
        </button>
        {message && <p className="kb-admin-message" role="status">{message}</p>}
        <p className="fine-print">Admin access is checked by the app backend. The password is never saved in this browser or displayed to customers.</p>
      </div>
    );
  }

  return (
    <div className="modal-content kb-admin-shell">
      <div className="kb-admin-toolbar">
        <div><span className="kb-admin-kicker">K&B CONTROL CENTRE</span><h3>Customer app studio</h3></div>
        <button className="kb-admin-logout" onClick={signOut}><LogOut size={15} /> Sign out</button>
      </div>

      <section className="kb-admin-section">
        <div className="kb-admin-section-head"><div><span>01 · LIVE PLAN CATALOGUE</span><h4>Plans, pricing and availability</h4></div><small>{managementPlans.length} plans</small></div>
        <p className="kb-admin-help">Edits are saved directly to the existing Management Nexus plan catalogue. The customer portal reads this same source, so plan prices and availability remain aligned. Archive plans instead of deleting plans linked to customers.</p>
        <div className="kb-admin-plan-list">
          {managementPlans.map(plan => (
            <article className="kb-admin-plan-editor" key={plan.id}>
              <div className="kb-admin-plan-editor-head"><b>{plan.name}</b><span className={plan.active ? 'is-live' : 'is-archived'}>{plan.active ? 'LIVE' : 'ARCHIVED'}</span></div>
              <div className="kb-admin-plan-fields">
                <label>Plan name<input value={plan.name} onChange={event => setManagementPlans(current => current.map(item => item.id === plan.id ? { ...item, name: event.target.value } : item))} /></label>
                <label>Provider<input value={plan.provider} onChange={event => setManagementPlans(current => current.map(item => item.id === plan.id ? { ...item, provider: event.target.value } : item))} /></label>
                <label>Monthly price (₹)<input type="number" min="0" max="1000000" value={plan.price} onChange={event => setManagementPlans(current => current.map(item => item.id === plan.id ? { ...item, price: Number(event.target.value) } : item))} /></label>
                <label>Speed<input value={plan.speed} onChange={event => setManagementPlans(current => current.map(item => item.id === plan.id ? { ...item, speed: event.target.value } : item))} /></label>
                <label>Monthly data<input value={plan.data} onChange={event => setManagementPlans(current => current.map(item => item.id === plan.id ? { ...item, data: event.target.value } : item))} /></label>
                <label>Connection type<input value={plan.connectionType} onChange={event => setManagementPlans(current => current.map(item => item.id === plan.id ? { ...item, connectionType: event.target.value } : item))} /></label>
                <label>Short note<input value={plan.note} onChange={event => setManagementPlans(current => current.map(item => item.id === plan.id ? { ...item, note: event.target.value } : item))} /></label>
                <label>Customer description<textarea rows={2} value={plan.details} onChange={event => setManagementPlans(current => current.map(item => item.id === plan.id ? { ...item, details: event.target.value } : item))} /></label>
              </div>
              <div className="kb-admin-plan-actions">
                <label className="kb-admin-check"><input type="checkbox" checked={plan.featured} onChange={event => setManagementPlans(current => current.map(item => item.id === plan.id ? { ...item, featured: event.target.checked } : item))} /> Featured plan</label>
                <button type="button" className="primary-button" disabled={busy} onClick={() => void saveEditedPlan(plan)}>Save plan</button>
                {plan.active && <button type="button" className="kb-admin-logout" disabled={busy} onClick={() => void archiveManagementPlan(plan)}>Archive</button>}
              </div>
            </article>
          ))}
        </div>
        <div className="kb-admin-new-plan">
          <h4>Add a new plan</h4>
          <div className="kb-admin-plan-fields">
            <label>Plan name<input value={planDraft.name} onChange={event => setPlanDraft(current => ({ ...current, name: event.target.value }))} /></label>
            <label>Provider<input value={planDraft.provider} onChange={event => setPlanDraft(current => ({ ...current, provider: event.target.value }))} /></label>
            <label>Monthly price (₹)<input type="number" min="0" max="1000000" value={planDraft.price} onChange={event => setPlanDraft(current => ({ ...current, price: Number(event.target.value) }))} /></label>
            <label>Speed<input value={planDraft.speed} onChange={event => setPlanDraft(current => ({ ...current, speed: event.target.value }))} /></label>
            <label>Monthly data<input value={planDraft.data} onChange={event => setPlanDraft(current => ({ ...current, data: event.target.value }))} /></label>
            <label>Connection type<input value={planDraft.connectionType} onChange={event => setPlanDraft(current => ({ ...current, connectionType: event.target.value }))} /></label>
            <label>Short note<input value={planDraft.note} onChange={event => setPlanDraft(current => ({ ...current, note: event.target.value }))} /></label>
            <label>Customer description<textarea rows={2} value={planDraft.details} onChange={event => setPlanDraft(current => ({ ...current, details: event.target.value }))} /></label>
          </div>
          <label className="kb-admin-check"><input type="checkbox" checked={planDraft.featured} onChange={event => setPlanDraft(current => ({ ...current, featured: event.target.checked }))} /> Feature on customer portal</label>
          <button type="button" className="primary-button" disabled={busy} onClick={() => void saveNewPlan()}><Plus size={16} /> Add plan to live catalogue</button>
        </div>
      </section>

      <section className="kb-admin-section">
        <div className="kb-admin-section-head"><div><span>02 · CAMPAIGN DESIGN</span><h4>Home page offer banner</h4></div></div>
        <label>Offer badge</label>
        <input value={draft.promo.badge} onChange={event => setDraft(current => ({ ...current, promo: { ...current.promo, badge: event.target.value } }))} />
        <label>Headline</label>
        <input value={draft.promo.title} onChange={event => setDraft(current => ({ ...current, promo: { ...current.promo, title: event.target.value } }))} />
        <label>Supporting message</label>
        <textarea rows={2} value={draft.promo.body} onChange={event => setDraft(current => ({ ...current, promo: { ...current.promo, body: event.target.value } }))} />
        <label>Button label</label>
        <input value={draft.promo.cta} onChange={event => setDraft(current => ({ ...current, promo: { ...current.promo, cta: event.target.value } }))} />
        <label className="kb-admin-check"><input type="checkbox" checked={draft.promo.active} onChange={event => setDraft(current => ({ ...current, promo: { ...current.promo, active: event.target.checked } }))} /> Show campaign banner on customer home</label>
      </section>

      <section className="kb-admin-section">
        <div className="kb-admin-section-head"><div><span>03 · VISUAL CONTENT</span><h4>Rotating promotional images</h4></div><small>{draft.heroImages.length} slides</small></div>
        <div className="kb-admin-image-grid">
          {draft.heroImages.map((image, index) => (
            <div className="kb-admin-image-item" key={image.path || image.src}>
              <img src={image.src} alt={image.alt || 'Promotional slide'} />
              <span>SLIDE {index + 1}</span>
              <button type="button" aria-label="Remove image" onClick={() => setDraft(current => ({ ...current, heroImages: current.heroImages.filter((_, i) => i !== index) }))}><X size={15} /></button>
            </div>
          ))}
        </div>
        <label>Add image by HTTPS address</label>
        <div className="kb-admin-inline"><input value={imageUrl} onChange={event => setImageUrl(event.target.value)} placeholder="https://example.com/promotion.jpg" /><button type="button" onClick={addImageUrl}><Plus size={16} /> Add</button></div>
        <label className="kb-admin-upload">
          <ImagePlus size={19} /><span><b>Upload campaign image</b><small>JPG, PNG or WebP · up to 5 MB</small></span><Upload size={17} />
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => uploadImage(event.target.files?.[0])} />
        </label>
      </section>

      <div className="kb-admin-savebar">
        <div><b>Publish customer app content</b><small>Campaign copy and promotional images are saved here. Plans stay synchronised from Management Nexus.</small></div>
        <button className="primary-button" onClick={save} disabled={busy}><Save size={16} /> {busy ? 'Saving…' : 'Save & publish'}</button>
      </div>
      {message && <p className="kb-admin-message" role="status"><CheckCircle2 size={16} /> {message}</p>}
      <p className="fine-print">This editor controls campaign copy and promotional images only. Plan pricing, customer accounts, payments and service records remain managed in K&amp;B Management Nexus.</p>
    </div>
  );
}
