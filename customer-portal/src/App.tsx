import { useEffect, useMemo, useState } from 'react';
import { api } from './lib/api';
import { plans, money, heroImages, getSeasonalFestival, getCustomerGreeting, type Plan } from './data/catalog';
import PlanCard from './components/PlanCard';
import AdminStudio from './components/AdminStudio';
import { defaultPortalContent, type PortalContent } from './data/portalContent';
import SiteHeader from './components/SiteHeader';
import { LanguageLayer, type Language } from './i18n/LanguageLayer';
import {
  Wifi,
  Home,
  Router,
  Compass,
  Headphones,
  UserRound,
  Bell,
  ChevronRight,
  ChevronLeft,
  ArrowUpRight,
  Zap,
  ShieldCheck,
  Clock3,
  CalendarDays,
  CreditCard,
  ReceiptText,
  CircleHelp,
  MessageCircle,
  Camera,
  Upload,
  CheckCircle2,
  AlertCircle,
  Signal,
  Menu,
  X,
  Smartphone,
  LockKeyhole,
  Sparkles,
  MapPin,
  Phone,
  Globe,
  RefreshCw,
  Plus,
  Search,
  SlidersHorizontal,
  Ticket,
  FileText,
  LogOut,
  Sun,
  Moon,
} from 'lucide-react';

type Tab = 'Home' | 'My Connection' | 'Explore' | 'Support' | 'Account';
type Modal =
  | null
  | 'login'
  | 'renew'
  | 'booking'
  | 'complaint'
  | 'plan'
  | 'notifications'
  | 'payments'
  | 'faq'
  | 'advisor'
  | 'callback'
  | 'terms'
  | 'admin';

function App() {
  const [language,setLanguage]=useState<Language>(()=>{const saved=window.localStorage.getItem('kb-customer-language');return saved==='hi'||saved==='gu'?saved:'en';});
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  const [tab, setTab] = useState<Tab>('Home');
  const [modal, setModal] = useState<Modal>(() => window.location.hash.startsWith('#admin-sso=') ? 'admin' : 'login');
  const [managementHandoffToken] = useState(() => {
    const hash = window.location.hash;
    if (!hash.startsWith('#admin-sso=')) return '';
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    try { return decodeURIComponent(hash.slice('#admin-sso='.length)); } catch { return ''; }
  });
  const [registerMode, setRegisterMode] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [selectedPlan, setSelectedPlan] = useState(plans[0]);
  const [phone, setPhone] = useState('');
  const [otpRequested, setOtpRequested] = useState(false);
  const [complaintType, setComplaintType] = useState('No internet');
  const [complaintText, setComplaintText] = useState('');
  const [complaintPhone, setComplaintPhone] = useState('');
  const [complaintPhoto, setComplaintPhoto] = useState<File | null>(null);
  const [photoName, setPhotoName] = useState('');
  const [complaintSent, setComplaintSent] = useState(false);
  const [complaintSubmitting, setComplaintSubmitting] = useState(false);
  const [complaintMessage, setComplaintMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('Recommended');
  const [bookingStep, setBookingStep] = useState(1);
  const [bookingFullName, setBookingFullName] = useState('');
  const [bookingPhone, setBookingPhone] = useState('');

  const [bookingState, setBookingState] = useState('');
  const [bookingCity, setBookingCity] = useState('');
  const [bookingPincode, setBookingPincode] = useState('');
  const [bookingAddress, setBookingAddress] = useState('');
  const [bookingMessage, setBookingMessage] = useState('');
  const [bookingTermsAccepted, setBookingTermsAccepted] = useState(false);
  const [bookingPaymentChoice, setBookingPaymentChoice] = useState<'upi' | 'cash' | ''>('');
  const [faqOpen, setFaqOpen] = useState(0);
  const [advisorMessages, setAdvisorMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([
    { role: 'assistant', content: 'Hi! I can help find a suitable K&B plan. First, how many people and devices usually use your internet at the same time?' }
  ]);
  const [advisorInput, setAdvisorInput] = useState('');
  const [advisorLoading, setAdvisorLoading] = useState(false);
  const [callbackIssue, setCallbackIssue] = useState('Slow internet');
  const [callbackSent, setCallbackSent] = useState(false);
  const [appearance, setAppearance] = useState<'light' | 'dark'>('light');
  const [heroImageIndex, setHeroImageIndex] = useState(0);
  const [floatingOfferDismissed, setFloatingOfferDismissed] = useState(false);
  const [portalContent, setPortalContent] = useState<PortalContent>(defaultPortalContent);
  const [planSource, setPlanSource] = useState<'management-nexus' | 'legacy-fallback'>('legacy-fallback');
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  const [bookingRequestSubmitted, setBookingRequestSubmitted] = useState(false);
  const [bookingRequestId, setBookingRequestId] = useState('');
  const portalImages = portalContent.heroImages.length ? portalContent.heroImages : defaultPortalContent.heroImages;
  const portalPlans = portalContent.plans.filter(plan => plan.active !== false);
  const featuredPlan = portalPlans.find(plan => plan.featured) || portalPlans[0];

  useEffect(() => {
    const imageTimer = window.setInterval(() => {
      setHeroImageIndex(current => (current + 1) % Math.max(portalImages.length, 1));
    }, 4600);
    return () => window.clearInterval(imageTimer);
  }, [portalImages.length]);

  useEffect(() => {
    let active = true;
    api.get('/api/portal/plans').then(response => {
      if (!active) return;
      const items = Array.isArray(response.data?.items) ? response.data.items as Plan[] : [];
      setPortalContent({ ...defaultPortalContent, plans: items });
      setPlanSource('management-nexus');
      if (items.length) {
        setSelectedPlan(current => items.find(plan => plan.id === current.id) || items[0]);
      }
    }).catch(() => {
      if (active) setPlanSource('legacy-fallback');
    });
    return () => { active = false; };
  }, []);
  const [festival, setFestival] = useState('auto');
  const [clockNow, setClockNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  const [demoInvoice, setDemoInvoice] = useState<{
    invoiceNo: string;
    paidAt: string;
    customerName: string;
    mobile: string;
    planName: string;
    base: number;
    gst: number;
    total: number;
    paymentStatus: 'PAID' | 'UNPAID';
    paymentMethod: string;
  } | null>(null);
  const activeFestival = festival === 'auto' ? getSeasonalFestival(clockNow) : festival;
  const customerGreeting = getCustomerGreeting(clockNow, [firstName, lastName].filter(Boolean).join(' '));
  const todayLabel = new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Asia/Kolkata'
  }).format(clockNow).toUpperCase();
  const demoBaseAmount = 499;
  const demoCgstAmount = Number((demoBaseAmount * 0.09).toFixed(2));
  const demoSgstAmount = Number((demoBaseAmount * 0.09).toFixed(2));
  const demoGstAmount = Number((demoCgstAmount + demoSgstAmount).toFixed(2));
  const demoTotalAmount = Number((demoBaseAmount + demoGstAmount).toFixed(2));
  const bookingCgstAmount = Number((selectedPlan.price * 0.09).toFixed(2));
  const bookingSgstAmount = Number((selectedPlan.price * 0.09).toFixed(2));
  const bookingGstAmount = Number((bookingCgstAmount + bookingSgstAmount).toFixed(2));
  const bookingTotalAmount = Number((selectedPlan.price + bookingGstAmount).toFixed(2));

  const visiblePlans = useMemo(() => {
    const filtered = portalPlans.filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase())
    );
    return filter === 'Price: low to high'
      ? [...filtered].sort((a, b) => a.price - b.price)
      : filtered;
  }, [portalPlans, search, filter]);

  const toast = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 3000);
  };

  const sendAdvisorMessage = async (suggestedMessage?: string) => {
    const message = (suggestedMessage ?? advisorInput).trim();
    if (!message || advisorLoading) return;
    const nextMessages = [...advisorMessages, { role: 'user' as const, content: message }];
    setAdvisorMessages(nextMessages);
    setAdvisorInput('');
    setAdvisorLoading(true);
    try {
      const response = await api.post('/api/plan-advisor', {
        messages: nextMessages.slice(-10),
        customerName: [firstName.trim(), lastName.trim()].filter(Boolean).join(' ')
      });
      const reply = typeof response.data?.reply === 'string'
        ? response.data.reply
        : 'I could not prepare a recommendation just now. Please try again.';
      setAdvisorMessages(current => [...current, { role: 'assistant', content: reply }]);
    } catch {
      setAdvisorMessages(current => [...current, {
        role: 'assistant',
        content: 'The plan advisor is temporarily unavailable. Please try again in a moment.'
      }]);
    } finally {
      setAdvisorLoading(false);
    }
  };

  const openPlan = (plan: Plan) => {
    setSelectedPlan(plan);
    setBookingStep(1);
    setBookingPaymentChoice('');
    setBookingTermsAccepted(false);
    setBookingRequestSubmitted(false);
    setBookingRequestId('');
    setDemoInvoice(null);
    setModal('booking');
  };

  const submitConnectionRequest = async () => {
    if (!bookingTermsAccepted) {
      toast('Please review and acknowledge the K&B terms first.');
      return;
    }
    if (!bookingPaymentChoice) {
      toast('Please choose a payment preference.');
      return;
    }
    setBookingSubmitting(true);
    try {
      const response = await api.post('/api/portal/connection-requests', {
        name: bookingFullName.trim(),
        phone: bookingPhone,
        state: bookingState.trim(),
        city: bookingCity.trim(),
        pincode: bookingPincode,
        address: bookingAddress.trim(),
        planId: selectedPlan.id,
        notes: bookingMessage.trim(),
        paymentPreference: bookingPaymentChoice === 'cash' ? 'Cash after installation' : 'To be discussed with K&B'
      });
      setBookingRequestId(String(response.data?.requestId || ''));
      setBookingRequestSubmitted(true);
      setBookingTermsAccepted(false);
      toast('Your request has been sent to K&B for review.');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not submit your request. Please try again.');
    } finally {
      setBookingSubmitting(false);
    }
  };

  const readFileAsBase64 = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === 'string' ? reader.result : '';
      const comma = value.indexOf(',');
      if (comma < 0) reject(new Error('The selected photo could not be read.'));
      else resolve(value.slice(comma + 1));
    };
    reader.onerror = () => reject(new Error('The selected photo could not be read.'));
    reader.readAsDataURL(file);
  });

  const submitComplaint = async () => {
    if (!/^\\d{10}$/.test(complaintPhone)) {
      toast('Enter the registered 10-digit mobile number.');
      return;
    }
    if (!complaintText.trim()) {
      toast('Please describe your issue.');
      return;
    }
    if (!complaintPhoto) {
      toast('Please attach a router or modem photo.');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(complaintPhoto.type) || complaintPhoto.size > 2 * 1024 * 1024) {
      toast('Choose a JPG, PNG or WebP photo up to 2 MB.');
      return;
    }
    setComplaintSubmitting(true);
    setComplaintMessage('');
    try {
      const dataBase64 = await readFileAsBase64(complaintPhoto);
      const response = await api.post('/api/portal/complaints', {
        phone: complaintPhone,
        subject: complaintType,
        details: complaintText.trim(),
        fileName: complaintPhoto.name,
        mimeType: complaintPhoto.type,
        dataBase64
      });
      setComplaintMessage(String(response.data?.message || 'If the details match an active K&B connection, your support request will be reviewed by our team.'));
      setComplaintSent(true);
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Your support request could not be submitted. Please try again.');
    } finally {
      setComplaintSubmitting(false);
    }
  };

  const navItems: { label: Tab; icon: typeof Home }[] = [
    { label: 'Home', icon: Home },
    { label: 'My Connection', icon: Router },
    { label: 'Explore', icon: Compass },
    { label: 'Support', icon: Headphones },
    { label: 'Account', icon: UserRound },
  ];

  const HomeScreen = () => (
    <div className="screen-stack">
      {planSource === 'legacy-fallback' && <div className="integration-notice"><ShieldCheck size={16} /><span>Live plan sync is awaiting the Management Nexus backend release. Existing portal plans remain visible until the shared catalogue is available.</span></div>}
      <section className="welcome-row">
        <div>
          <span className="eyebrow">{todayLabel}</span>
          <h1>
            {customerGreeting} <span>✦</span>
          </h1>
          <p>Explore your K&B customer portal.</p>
        </div>
        <div className="welcome-art">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <Wifi size={58} />
          <span className="art-dot d1" />
          <span className="art-dot d2" />
        </div>
      </section>
      <section className="hero-card">
        <div className="hero-copy">
          <span className="hero-label">
            <i /> YOUR K&B PORTAL PREVIEW
          </span>
          <h2>
            Fast internet.
            <br />
            <span>More possibilities.</span>
          </h2>
          <p>Stay connected to everything that matters.</p>
          <button
            className="white-button"
            onClick={() => setTab('My Connection')}
          >
            View my connection <ChevronRight size={17} />
          </button>
        </div>
        <div className="hero-visual">
          <div className="hero-photo">
            <img
              key={heroImageIndex}
              src={portalImages[heroImageIndex % portalImages.length]?.src || heroImages[0]}
              alt="K&B home internet, fiber and network technology"
            />
          </div>
          <div className="hero-floating-image float-router" aria-hidden="true">
            <img
              src="https://images.unsplash.com/photo-1544197150-b99a580bb7a8?auto=format&fit=crop&w=300&q=75"
              alt=""
            />
          </div>
          <div className="hero-floating-image float-network" aria-hidden="true">
            <img
              src="https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=300&q=75"
              alt=""
            />
          </div>
          <div className="wifi-rings">
            <Wifi size={54} />
          </div>
          <div className="speed-chip">
            <Zap size={14} /> {featuredPlan?.speed || 'Fiber broadband'}
          </div>
          <span className="spark s1">✦</span>
          <span className="spark s2">✧</span>
        </div>
      </section>
      {portalContent.promo.active && (
        <section className="kb-offer-banner">
          <span className="kb-offer-icon"><Sparkles size={25} /></span>
          <div className="kb-offer-copy">
            <span>{portalContent.promo.badge}</span>
            <h2>{portalContent.promo.title}</h2>
            <p>{portalContent.promo.body}</p>
          </div>
          <button onClick={() => setTab('Explore')}>{portalContent.promo.cta} <ArrowUpRight size={16} /></button>
        </section>
      )}
      <section className="quick-grid">
        <button className="quick-card" onClick={() => setModal('renew')}>
          <span className="quick-icon violet">
            <RefreshCw />
          </span>
          <b>Renew plan</b>
          <small>Keep your internet active</small>
          <ChevronRight size={17} />
        </button>
        <button className="quick-card" onClick={() => setModal('complaint')}>
          <span className="quick-icon blue">
            <MessageCircle />
          </span>
          <b>Raise complaint</b>
          <small>We’re here to help</small>
          <ChevronRight size={17} />
        </button>
        <button className="quick-card" onClick={() => setModal('payments')}>
          <span className="quick-icon green">
            <CreditCard />
          </span>
          <b>Payments</b>
          <small>View bills & receipts</small>
          <ChevronRight size={17} />
        </button>
        <button className="quick-card" onClick={() => setModal('booking')}>
          <span className="quick-icon orange">
            <Plus />
          </span>
          <b>New connection</b>
          <small>Bring K&B to your home</small>
          <ChevronRight size={17} />
        </button>
      </section>
      <section className="section-block">
        <div className="section-heading">
          <div>
            <span className="eyebrow">YOUR SUBSCRIPTION</span>
            <h2>Connection overview</h2>
          </div>
          <button className="text-link" onClick={() => setTab('My Connection')}>
            See details <ChevronRight size={16} />
          </button>
        </div>
        <div className="connection-card">
          <div className="connection-head">
            <span className="connection-icon">
              <Router />
            </span>
            <div>
              <b>Home Fiber Connection</b>
              <small>Customer ID: KB-20481</small>
            </div>
            <span className="status-pill">
              <i /> Sample data
            </span>
          </div>
          <div className="connection-details">
            <div>
              <small>Current plan</small>
              <b>₹499 / 50 Mbps</b>
            </div>
            <div>
              <small>Renewal date</small>
              <b>20 Nov 2026</b>
            </div>
            <div>
              <small>Usage this month</small>
              <b>
                680 GB <span className="muted">/ 1.5 TB</span>
              </b>
            </div>
          </div>
          <div className="usage-track">
            <span style={{ width: '45%' }} />
          </div>
          <div className="usage-foot">
            <span>45% data used</span>
            <span>820 GB remaining</span>
          </div>
        </div>
      </section>
      <section className="section-block">
        <div className="section-heading">
          <div>
            <span className="eyebrow">MADE FOR YOUR HOME</span>
            <h2>Popular plans</h2>
          </div>
          <button className="text-link" onClick={() => setTab('Explore')}>
            Explore all <ChevronRight size={16} />
          </button>
        </div>
        <div className="plans-grid">
          {(portalPlans.filter(plan => plan.featured).length ? portalPlans.filter(plan => plan.featured) : portalPlans).slice(0, 3).map(p => (
            <PlanCard key={p.id} plan={p} onSelect={openPlan} />
          ))}
        </div>
      </section>
      <section className="promo-banner">
        <div className="promo-icon">
          <Sparkles />
        </div>
        <div>
          <span>THE K&B EXPERIENCE</span>
          <h3>Need a faster connection?</h3>
          <p>Find a plan that fits your streaming, gaming and work.</p>
        </div>
        <div className="promo-actions">
          <button onClick={() => setTab('Explore')}>
            Explore plans <ArrowUpRight size={16} />
          </button>
          <button className="advisor-promo-button" onClick={() => setModal('advisor')}>
            Ask K&B AI <Sparkles size={16} />
          </button>
        </div>
        <div className="promo-photo">
          <img
            src="https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=900&q=85"
            alt="High-speed internet network equipment"
          />
          <span>POWERED BY FIBER</span>
        </div>
      </section>
    </div>
  );

  const ConnectionScreen = () => (
    <div className="screen-stack">
      <div className="page-title">
        <span className="eyebrow">YOUR K&B ACCOUNT</span>
        <h1>My Connection</h1>
        <p>All your internet details, together in one place.</p>
      </div>
      <div className="connection-card large">
        <div className="connection-head">
          <span className="connection-icon">
            <Router />
          </span>
          <div>
            <b>Home Fiber Connection</b>
            <small>KB-20481 · Residential</small>
          </div>
          <span className="status-pill">
            <i /> Sample data
          </span>
        </div>
        <div className="connection-details">
          <div>
            <small>Plan amount</small>
            <b>₹499</b>
          </div>
          <div>
            <small>Internet speed</small>
            <b>50 Mbps</b>
          </div>
          <div>
            <small>Renewal date</small>
            <b>20 Nov 2026</b>
          </div>
        </div>
        <div className="usage-title">
          <b>Monthly data usage</b>
          <span>680 GB of 1.5 TB</span>
        </div>
        <div className="usage-track">
          <span style={{ width: '45%' }} />
        </div>
        <div className="usage-foot">
          <span>45% used · Demo sample</span>
          <span>Resets on 21 Nov</span>
        </div>
        <div className="usage-explainer">
          <div className="usage-explainer-head">
            <b>How your usage is measured</b>
            <span className="demo-chip">SAMPLE DATA</span>
          </div>
          <p>In the live portal, usage will come from K&B's ISP accounting system (such as RADIUS/PPPoE records), not from your phone. The system totals your connection's downloaded and uploaded data for the billing cycle.</p>
          <div className="usage-breakdown">
            <span><i className="usage-dot download-dot" /> Download <b>612 GB</b></span>
            <span><i className="usage-dot upload-dot" /> Upload <b>68 GB</b></span>
            <span><i className="usage-dot total-dot" /> Total <b>680 GB</b></span>
          </div>
          <small>These figures are illustrative only. Live usage starts after the ISP data source is connected and customer account mapping is verified.</small>
        </div>
        <button
          className="primary-button full"
          onClick={() => setModal('renew')}
        >
          Renew subscription <ChevronRight size={17} />
        </button>
      </div>
      <div className="two-cards">
        <div className="info-card">
          <span className="info-icon">
            <MapPin />
          </span>
          <small>Installation address</small>
          <b>Haridarshan, Nava Naroda</b>
          <p>Ahmedabad, Gujarat 382330</p>
          <button
            onClick={() =>
              toast(
                'Address editing will be available after account verification.'
              )
            }
          >
            Manage address <ChevronRight size={15} />
          </button>
        </div>
        <div className="info-card">
          <span className="info-icon cyan">
            <Wifi />
          </span>
          <small>Router / modem</small>
          <b>Fiber ONT Router</b>
          <p>Device status: Connected</p>
          <button
            onClick={() =>
              toast(
                'Router diagnostics will connect after backend integration.'
              )
            }
          >
            Device details <ChevronRight size={15} />
          </button>
        </div>
      </div>
      <section className="section-block">
        <div className="section-heading">
          <div>
            <span className="eyebrow">ACCOUNT ACTIVITY</span>
            <h2>Subscription history</h2>
          </div>
        </div>
        <div className="list-card">
          <div className="list-row">
            <span className="list-icon">
              <CheckCircle2 />
            </span>
            <div>
              <b>Fiber 499 · 30 days</b>
              <small>22 Oct 2026 · Completed</small>
            </div>
            <strong>₹499</strong>
          </div>
          <div className="list-row">
            <span className="list-icon">
              <CheckCircle2 />
            </span>
            <div>
              <b>Fiber 499 · 30 days</b>
              <small>22 Sep 2026 · Completed</small>
            </div>
            <strong>₹499</strong>
          </div>
        </div>
      </section>
    </div>
  );

  const ExploreScreen = () => (
    <div className="screen-stack">
      <div className="page-title">
        <span className="eyebrow">FIND YOUR PERFECT SPEED</span>
        <h1>Explore plans</h1>
        <p>Pick the connection that works for your home.</p>
      </div>
      <div className="search-row">
        <Search size={18} />
        <input
          type="search"
          aria-label="Search internet plans"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search internet plans..."
        />
        <button
          onClick={() =>
            setFilter(
              filter === 'Recommended' ? 'Price: low to high' : 'Recommended'
            )
          }
        >
          <SlidersHorizontal size={17} />
          <span>{filter}</span>
        </button>
      </div>
      <div className="plan-highlight">
        <div>
          <span className="eyebrow">K&B RECOMMENDS</span>
          <h2>Great internet starts here.</h2>
          <p>Reliable fiber plans for work, learning and entertainment.</p>
        </div>
        <div className="highlight-symbol">
          <img
            src="https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=500&q=85"
            alt="Modern network technology"
          />
          <Signal size={25} />
        </div>
      </div>
      <div className="plans-grid explore-plans">
        {visiblePlans.map(p => (
          <PlanCard key={p.id} plan={p} onSelect={openPlan} />
        ))}
      </div>
      <div className="plan-info-card">
        <span className="plan-info-icon"><ShieldCheck size={18} /></span>
        <div>
          <b>About K&B Fiber plans</b>
          <p>
            Prices shown are monthly base amounts before applicable taxes.
            Speed and data allowances depend on network availability and fair-use
            terms. K&B will confirm final charges and installation details before
            booking.
          </p>
        </div>
      </div>
      <p className="fine-print">
        *Plan benefits, availability, taxes and fair-use terms are subject to
        confirmation by K&B NET SERVICE.
      </p>
    </div>
  );

  const SupportScreen = () => (
    <div className="screen-stack">
      <div className="page-title">
        <span className="eyebrow">WE’RE WITH YOU</span>
        <h1>Support centre</h1>
        <p>Tell us what’s happening. We’ll help you get back online.</p>
      </div>
      <div className="support-hero">
        <div className="support-orb">
          <Headphones size={34} />
        </div>
        <div>
          <span>NEED A HAND?</span>
          <h2>We’re just a message away.</h2>
          <p>Raise a ticket and follow every update.</p>
        </div>
      </div>
      <div className="support-actions">
        <button
          onClick={() => {
            setComplaintSent(false);
            setModal('complaint');
          }}
        >
          <span className="quick-icon blue">
            <MessageCircle />
          </span>
          <b>Raise a complaint</b>
          <small>Report a connection issue</small>
          <ChevronRight />
        </button>
        <button onClick={() => setModal('faq')}>
          <span className="quick-icon violet">
            <CircleHelp />
          </span>
          <b>Browse FAQs</b>
          <small>Quick answers and guides</small>
          <ChevronRight />
        </button>
      </div>
      <section className="section-block">
        <div className="section-heading">
          <div>
            <span className="eyebrow">YOUR RECENT REQUEST</span>
            <h2>Support tickets</h2>
          </div>
          <span className="count-pill">1 ticket</span>
        </div>
        <div className="ticket-card">
          <div className="ticket-top">
            <span className="ticket-id">#KB-DEMO-1038</span>
            <span className="status-progress">Sample</span>
          </div>
          <h3>Slow internet speed</h3>
          <p>Sample ticket only; no live support ticket is connected.</p>
          <div className="ticket-meta">
            <span>
              <CalendarDays size={14} /> Sample date
            </span>
            <span>
              <Clock3 size={14} /> Preview only
            </span>
          </div>
          <div className="ticket-progress">
            <span className="done" />
            <span className="done" />
            <span className="current" />
            <span />
          </div>
          <div className="ticket-steps">
            <span>Submitted</span>
            <span>Assigned</span>
            <span>In progress</span>
            <span>Resolved</span>
          </div>
          <button
            className="text-link"
            onClick={() =>
              toast(
                'Ticket details preview: technician assigned, update pending.'
              )
            }
          >
            View ticket details <ChevronRight size={15} />
          </button>
        </div>
      </section>
      <div className="agent-call-card">
        <div className="agent-call-icon"><Phone size={21} /></div>
        <div>
          <b>Talk to your assigned support agent</b>
          <small>Request a callback. Your agent's verified number and private calling PIN will appear after Management Nexus assignment.</small>
        </div>
        <button onClick={() => { setCallbackSent(false); setModal('callback'); }}>
          Request call <ChevronRight size={16} />
        </button>
      </div>
      <div className="contact-strip">
        <div>
          <b>Prefer to talk?</b>
          <small>Customer support: 079-29992999</small>
        </div>
        <a href="tel:07929992999">
          <Phone size={16} /> Call 079-29992999
        </a>
      </div>
    </div>
  );

  const AccountScreen = () => (
    <div className="screen-stack">
      <div className="page-title">
        <span className="eyebrow">YOUR PROFILE</span>
        <h1>Account</h1>
        <p>Manage your profile, payments and preferences.</p>
      </div>
      <section className="appearance-panel">
        <div className="appearance-heading">
          <span className="menu-icon"><Sparkles /></span>
          <div>
            <b>Personalise your portal</b>
            <small>Choose day/night mode and seasonal festival colours.</small>
          </div>
        </div>
        <div className="appearance-controls">
          <button
            className="appearance-toggle"
            onClick={() => setAppearance(appearance === 'light' ? 'dark' : 'light')}
          >
            {appearance === 'light' ? <Moon size={17} /> : <Sun size={17} />}
            {appearance === 'light' ? 'Switch to night mode' : 'Switch to day mode'}
          </button>
          <label className="festival-select-label" htmlFor="festival-theme">Festival theme</label>
          <select
            id="festival-theme"
            value={festival}
            onChange={e => setFestival(e.target.value)}
          >
            <option value="auto">Automatic seasonal theme</option>
            <option value="none">Default K&B theme</option>
            <option value="diwali">Diwali lights</option>
            <option value="holi">Holi colours</option>
            <option value="navratri">Navratri celebration</option>
            <option value="christmas">Christmas sparkle</option>
            <option value="newyear">New Year glow</option>
          </select>
        </div>
      </section>
      <div className="profile-card">
        <div className="profile-avatar">K</div>
        <div>
          <h2>Kunal</h2>
          <p>Customer ID: KB-20481</p>
          <span className="verified">
            <ShieldCheck size={14} /> Demo customer profile
          </span>
        </div>
        <button
          onClick={() =>
            toast('Profile editing will be enabled after secure sign-in.')
          }
        >
          <ChevronRight />
        </button>
      </div>
      <div className="account-menu">
        <button onClick={() => setModal('admin')}>
          <span className="menu-icon"><ShieldCheck /></span>
          <span><b>Admin studio</b><small>Manage plans, offers and images</small></span>
          <ChevronRight />
        </button>
        <button onClick={() => setModal('payments')}>
          <span className="menu-icon">
            <CreditCard />
          </span>
          <span>
            <b>Payments & bills</b>
            <small>Transactions, invoices and receipts</small>
          </span>
          <ChevronRight />
        </button>
        <button onClick={() => setModal('notifications')}>
          <span className="menu-icon">
            <Bell />
          </span>
          <span>
            <b>Notifications</b>
            <small>Updates about your connection</small>
          </span>
          <ChevronRight />
        </button>
        <button onClick={() => setModal('faq')}>
          <span className="menu-icon">
            <CircleHelp />
          </span>
          <span>
            <b>Help & FAQs</b>
            <small>Guides and common questions</small>
          </span>
          <ChevronRight />
        </button>
        <button
          onClick={() =>
            toast('Security settings will be enabled with real authentication.')
          }
        >
          <span className="menu-icon">
            <LockKeyhole />
          </span>
          <span>
            <b>Privacy & security</b>
            <small>Login and account protection</small>
          </span>
          <ChevronRight />
        </button>
        <a className="account-menu-link" href="https://www.kandbnetservice.in/" target="_blank" rel="noreferrer">
          <span className="menu-icon"><Globe /></span>
          <span><b>K&B official website</b><small>kandbnetservice.in</small></span>
          <ArrowUpRight />
        </a>
      </div>
      <div className="account-footer">
        <span>Version 0.1 · Preview</span>
        <span>Powered by K&B NET SERVICE</span>
      </div>
    </div>
  );

  // Call these screen renderers directly. They are declared inside App;
  // rendering them as component types would remount the whole screen on every
  // keystroke and dismiss the mobile keyboard.
  const renderScreen = () => {
    switch (tab) {
      case 'Home':
        return HomeScreen();
      case 'My Connection':
        return ConnectionScreen();
      case 'Explore':
        return ExploreScreen();
      case 'Support':
        return SupportScreen();
      case 'Account':
        return AccountScreen();
    }
  };

  const ModalView = () => {
    if (!modal) return null;
    const close = () => {
      if (modal !== 'login') {
        if (modal === 'booking') {
          setBookingTermsAccepted(false);
          setBookingPaymentChoice('');
        }
        setModal(null);
      }
    };
    return (
      <div
        className="modal-backdrop"
        onMouseDown={e => {
          if (e.target === e.currentTarget) close();
        }}
      >
        <div className="modal-sheet" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div className="modal-head">
            <div>
              <span className="eyebrow">K&B NET SERVICE</span>
              <h2 id="modal-title">
                {modal === 'login'
                  ? 'Sign in to your account'
                  : modal === 'renew'
                    ? 'Renew your connection'
                    : modal === 'booking'
                      ? 'Book a new connection'
                      : modal === 'complaint'
                        ? 'Raise a complaint'
                        : modal === 'plan'
                          ? selectedPlan.name
                          : modal === 'notifications'
                            ? 'Notifications'
                            : modal === 'payments'
                              ? 'Payments & bills'
                              : modal === 'advisor'
                                ? 'K&B AI plan advisor'
                                : modal === 'callback'
                                  ? 'Request an agent call'
                                  : modal === 'terms'
                                    ? 'Terms & booking protocol'
                                    : modal === 'admin'
                                      ? 'Admin studio'
                                      : 'Help centre'}
              </h2>
            </div>
            {modal !== 'login' && (
              <button className="icon-btn" onClick={close} aria-label="Close">
                <X />
              </button>
            )}
          </div>
          {modal === 'login' && (
            <div className="modal-content">
              <p className="muted">
                {registerMode
                  ? 'Create your K&B customer profile. First and last name are required.'
                  : 'Sign in with your registered mobile number to continue.'}
              </p>
              {registerMode && (
                <>
                  <label htmlFor="customer-first-name">First name <span className="required">*</span></label>
                  <input
                    id="customer-first-name"
                    type="text"
                    autoComplete="given-name"
                    value={firstName}
                    onChange={e => setFirstName(e.target.value.replace(/[^a-zA-Z .'-]/g, '').slice(0, 50))}
                    placeholder="Enter first name"
                    required
                  />
                  <label htmlFor="customer-last-name">Last name <span className="required">*</span></label>
                  <input
                    id="customer-last-name"
                    type="text"
                    autoComplete="family-name"
                    value={lastName}
                    onChange={e => setLastName(e.target.value.replace(/[^a-zA-Z .'-]/g, '').slice(0, 50))}
                    placeholder="Enter last name"
                    required
                  />
                </>
              )}
              <label htmlFor="customer-mobile">Mobile number</label>
              <div className="phone-input">
                <span>🇮🇳 +91</span>
                <input
                  id="customer-mobile"
                  className="phone-number-field"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  value={phone}
                  onChange={e =>
                    setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))
                  }
                  placeholder="Enter 10-digit number"
                />
              </div>
              {otpRequested ? (
                <>
                  <div className="otp-preview-panel" role="status" aria-live="polite">
                    <span className="otp-preview-icon">
                      <ShieldCheck size={18} />
                    </span>
                    <div>
                      <b>Demo OTP request ready</b>
                      <p>
                        Real SMS, WhatsApp and Truecaller verification will be
                        connected after backend approval. No real identity has
                        been verified in this preview.
                      </p>
                    </div>
                  </div>
                  <button
                    className="primary-button full"
                    onClick={() => {
                      setModal(null);
                      setOtpRequested(false);
                    }}
                  >
                    Continue to preview <ChevronRight />
                  </button>
                </>
              ) : (
                <div className="auth-options">
                  <button
                    onClick={() => {
                      if (registerMode && !firstName.trim()) {
                        toast('Please enter your first name.');
                        return;
                      }
                      if (registerMode && !lastName.trim()) {
                        toast('Please enter your last name.');
                        return;
                      }
                      if (phone.length !== 10) {
                        toast('Enter a valid 10-digit mobile number.');
                        return;
                      }
                      setOtpRequested(true);
                    }}
                  >
                    Continue with SMS OTP <ChevronRight />
                  </button>
                  <button
                    onClick={() =>
                      toast(
                        'WhatsApp OTP will be enabled through official WhatsApp Business verification.'
                      )
                    }
                  >
                    Continue with WhatsApp OTP
                  </button>
                  <button
                    onClick={() =>
                      toast(
                        'Truecaller sign-in requires its supported SDK and your consent.'
                      )
                    }
                  >
                    Continue with Truecaller
                  </button>
                </div>
              )}
              {!otpRequested && (
                <button
                  className="auth-mode-switch"
                  onClick={() => {
                    setRegisterMode(!registerMode);
                    setOtpRequested(false);
                  }}
                >
                  {registerMode ? 'Already registered? Sign in' : 'New customer? Create an account'}
                </button>
              )}
              <p className="fine-print">
                Preview only: no real OTP is sent and no account is created. Live sign-in and registration will be connected to the existing K&B customer database.
              </p>
            </div>
          )}
          {modal === 'admin' && (
            <AdminStudio
              managementSessionToken={managementHandoffToken}
              initialContent={portalContent}
              onPublished={content => {
                setPortalContent(content);
                setSelectedPlan(current => content.plans.find(plan => plan.id === current.id) || content.plans[0] || current);
                setHeroImageIndex(0);
                toast('Customer app content updated.');
              }}
            />
          )}
          {modal === 'advisor' && (
            <div className="modal-content advisor-modal">
              <div className="advisor-intro">
                <span className="advisor-avatar"><Sparkles size={20} /></span>
                <div>
                  <b>K&B AI assistant</b>
                  <small>Plan advice, Wi-Fi help, billing explanations and customer guidance.</small>
                </div>
              </div>
              <div className="advisor-demo-note">
                <b>K&B AI assistant:</b> Get help with plan selection, basic Wi-Fi troubleshooting, billing and invoice explanations, new connections, and general support. It uses the displayed plan catalogue and cannot access live account, router, payment, or ticket records.
              </div>
              <div className="advisor-tools" aria-label="Choose an AI help topic">
                <button type="button" onClick={() => sendAdvisorMessage('Help me choose the best K&B internet plan for my household.')}>Plan advice</button>
                <button type="button" onClick={() => sendAdvisorMessage('Help me troubleshoot my Wi-Fi or internet connection with safe basic checks.')}>Wi-Fi help</button>
                <button type="button" onClick={() => sendAdvisorMessage('Explain the plan price, GST and invoice preview shown in this portal.')}>Billing & invoice</button>
                <button type="button" onClick={() => sendAdvisorMessage('Guide me through requesting a new K&B connection and explain what happens next.')}>New connection</button>
                <button type="button" onClick={() => sendAdvisorMessage('Help me find the right support option for my issue.')}>General support</button>
              </div>
              <div className="advisor-chat" aria-live="polite">
                {advisorMessages.map((item, index) => (
                  <div key={index} className={'advisor-message ' + item.role}>
                    {item.content}
                  </div>
                ))}
                {advisorLoading && <div className="advisor-message assistant">Thinking about the best fit…</div>}
              </div>
              <div className="advisor-compose">
                <input
                  value={advisorInput}
                  onChange={e => setAdvisorInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') sendAdvisorMessage(); }}
                  placeholder="e.g. 4 people, streaming and online classes..."
                  aria-label="Message the K&B plan advisor"
                />
                <button onClick={sendAdvisorMessage} disabled={advisorLoading || !advisorInput.trim()} aria-label="Send message">
                  <ArrowUpRight size={18} />
                </button>
              </div>
              <p className="fine-print">Recommendations are guidance only. K&B must confirm plan availability, final price, taxes and fair-use terms.</p>
            </div>
          )}
          {modal === 'callback' && (
            <div className="modal-content">
              {callbackSent ? (
                <>
                  <div className="success-note"><CheckCircle2 /> Demo callback request created.</div>
                  <div className="calling-pin-card">
                    <small>DEMO CALLING PIN · SAMPLE ONLY</small>
                    <strong>482731</strong>
                    <p>In the live system, this private PIN will be generated securely for this ticket and verified by the assigned agent. Do not treat this sample PIN as an active security code.</p>
                  </div>
                  <div className="agent-contact-pending">
                    <b>Assigned agent contact</b>
                    <span>Not available in this preview.</span>
                    <small>The live portal must retrieve the assigned employee's approved contact number from Management Nexus after assignment. No agent has been assigned to this demo request.</small>
                  </div>
                  <button className="primary-button full" onClick={() => { setModal(null); setCallbackSent(false); }}>Done</button>
                </>
              ) : (
                <>
                  <p className="muted">Tell K&B what you need help with. The real system will show the assigned agent's contact number and a private calling PIN once the request is assigned.</p>
                  <label>Customer name</label>
                  <input value={[firstName, lastName].filter(Boolean).join(' ')} readOnly placeholder="Customer name after sign-in" />
                  <label>Registered mobile number</label>
                  <input value={phone} readOnly placeholder="Sign in to verify your number" />
                  <label>Reason for call</label>
                  <select value={callbackIssue} onChange={e => setCallbackIssue(e.target.value)}>
                    <option>Slow internet</option>
                    <option>No internet</option>
                    <option>Billing or payment</option>
                    <option>Plan advice</option>
                    <option>New connection</option>
                    <option>Other support</option>
                  </select>
                  <button className="primary-button full" onClick={() => {
                    if (phone.length !== 10) {
                      toast('Sign in with your registered 10-digit mobile number first.');
                      return;
                    }
                    setCallbackSent(true);
                  }}>Create demo callback request <Phone size={16} /></button>
                  <p className="fine-print">Demo only: this request is not sent to Management Nexus and does not notify an employee.</p>
                </>
              )}
            </div>
          )}
          {modal === 'plan' && (
            <div className="modal-content">
              <div className={'modal-plan ' + selectedPlan.color}>
                <span>{selectedPlan.tag || 'K&B FIBER'}</span>
                <strong>
                  {money(selectedPlan.price)}
                  <small> / 30 days</small>
                </strong>
                <div>
                  <b>{selectedPlan.speed}</b>
                  <b>{selectedPlan.data}</b>
                </div>
              </div>
              <div className="plan-about">
                <b>About this plan</b>
                <p>
                  {selectedPlan.id === 'p2'
                    ? 'Designed for larger households, multiple devices and frequent streaming.'
                    : selectedPlan.id === 'p1'
                      ? 'A balanced monthly option for everyday family internet, streaming and online classes.'
                      : 'A practical monthly option for browsing, study and everyday internet use.'}
                </p>
              </div>
              <ul className="feature-list">
                {selectedPlan.features.map(f => (
                  <li key={f}>
                    <CheckCircle2 size={16} />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                className="primary-button full"
                onClick={() => {
                  setModal('booking');
                  setBookingStep(1);
                }}
              >
                Select this plan <ChevronRight />
              </button>
              <p className="fine-print">
                Availability and final charges are confirmed by K&B NET SERVICE.
              </p>
            </div>
          )}
          {modal === 'renew' && (
            <div className="modal-content">
              <div className="bill-summary">
                <span>Current plan</span>
                <b>K&B Fiber 499 · 50 Mbps</b>
                <span>Renewal date</span>
                <b>20 November 2026</b>
                <span>Amount due</span>
                <strong>₹499</strong>
              </div>
              <button
                className="primary-button full"
                onClick={() => setModal('payments')}
              >
                Review fixed demo payment <CreditCard />
              </button>
              <p className="fine-print">
                Demo checkout only. No payment will be collected.
              </p>
            </div>
          )}
          {modal === 'terms' && (
            <div className="modal-content terms-content">
              <div className="terms-source-note">
                <ShieldCheck size={18} />
                <div>
                  <b>K&B NET SERVICE policies</b>
                  <p>Policy wording supplied by K&B NET SERVICE for this customer portal.</p>
                  <a href="https://www.kandbnetservice.in/contact-us" target="_blank" rel="noreferrer">
                    Official website and booking page <ArrowUpRight size={14} />
                  </a>
                </div>
              </div>
              <nav className="policy-jump-links" aria-label="Policy sections">
                <a href="#privacy-policy">Privacy</a>
                <a href="#refund-cancellation">Refunds & cancellation</a>
                <a href="#terms-of-use">Terms of use</a>
                <a href="#data-security">Data security</a>
              </nav>
              <section className="policy-section" id="privacy-policy">
                <h3>1. Privacy Policy</h3>
                <p className="policy-intro">How we collect and use your information</p>
                <h4>Information We Collect</h4>
                <p>K&B Net Service collects personal information such as your name, address, email, phone number, and service usage details when you register for or use our broadband, fiber-optic, or wireless internet services.</p>
                <h4>How We Use It</h4>
                <p>Your information is used solely to provide, improve, and maintain our services — including billing, customer support, and service activation. We work with network partners including RailWire, RailTel, BSNL, Tikona, and GTPL to ensure reliable connectivity.</p>
                <h4>Policy Updates</h4>
                <p>We may update this policy from time to time. Changes will be posted on our official website and deemed accepted by your continued use of our services.</p>
              </section>
              <section className="policy-section" id="refund-cancellation">
                <h3>2. Refund &amp; Cancellation</h3>
                <p className="policy-intro">Our fair cancellation and refund process</p>
                <h4>Service Cancellation</h4>
                <p>Customers may cancel services according to their subscription plan terms. Written or email notice is required for cancellation requests.</p>
                <h4>Refund Process</h4>
                <p>Refunds, if applicable, are processed as per our internal policy and communicated via email or customer support within 7–14 business days.</p>
                <h4>No Liability for Outages</h4>
                <p>K&amp;B Net Service is not liable for temporary service outages due to technical issues, maintenance, or factors beyond our control such as natural disasters or third-party network failures.</p>
              </section>
              <section className="policy-section" id="terms-of-use">
                <h3>3. Terms of Use</h3>
                <p className="policy-intro">Rules and conditions for using our services</p>
                <h4>As-Is Services</h4>
                <p>All services provided by K&amp;B Net Service are offered "AS IS" without any warranty, express or implied, including warranties of performance, merchantability, or fitness for a particular purpose.</p>
                <h4>User Responsibility</h4>
                <p>You are responsible for the legal use of your internet connection. Misuse including illegal downloads, network attacks, or reselling bandwidth without authorization is strictly prohibited.</p>
                <h4>External Links</h4>
                <p>We may link to external websites not controlled by K&amp;B Net Service. Inclusion of any links does not imply endorsement; we are not responsible for the content or availability of those sites.</p>
              </section>
              <section className="policy-section" id="data-security">
                <h3>4. Data Security</h3>
                <p className="policy-intro">How we protect your personal data</p>
                <h4>Security Measures</h4>
                <p>We implement industry-standard security measures including encrypted storage and secure transmission protocols to protect your personal information from unauthorized access, disclosure, or loss.</p>
                <h4>Data Retention</h4>
                <p>We retain your data only for as long as necessary to provide services and comply with legal obligations. You may request deletion of your personal data by contacting our support team.</p>
                <h4>No Third-Party Selling</h4>
                <p>K&amp;B Net Service does not sell, rent, or trade your personal information to third parties for marketing purposes. Your data stays with us.</p>
              </section>
              <h3>Connection booking process</h3>
              <ol className="booking-protocol-list">
                <li><b>Submit your details</b><span>Provide your full name, mobile number, and complete installation address.</span></li>
                <li><b>OTP check</b><span>Complete the mobile verification step when live OTP service is enabled.</span></li>
                <li><b>Coverage and plan confirmation</b><span>K&amp;B checks availability and confirms the plan, charges and installation schedule.</span></li>
                <li><b>Installation and activation</b><span>Your connection becomes active after K&amp;B confirms installation and activation.</span></li>
              </ol>
              <p className="terms-disclaimer">The policy wording above is displayed as supplied. Booking submissions in this preview are not sent to K&amp;B operations, and the demo OTP does not verify a real mobile number.</p>
              <button className="primary-button full" onClick={close}>Close policies <CheckCircle2 size={16} /></button>
            </div>
          )}
          {modal === 'booking' && (
            <div className="modal-content">
              {bookingRequestSubmitted ? (
                <div className="submitted-state">
                  <span><CheckCircle2 size={38} /></span>
                  <h3>Request sent to K&amp;B</h3>
                  <p>Your connection request has been saved in K&amp;B Management Nexus for administrator review.</p>
                  {bookingRequestId && <p className="request-reference">Request reference: <b>{bookingRequestId}</b></p>}
                  <p className="fine-print">This is a connection request, not an active customer account or invoice. K&amp;B will confirm coverage, installation details and final charges before activation. No payment has been collected.</p>
                  <button className="primary-button full" onClick={() => { setModal(null); setBookingRequestSubmitted(false); setBookingRequestId(''); }}>Done</button>
                </div>
              ) : (
                <>
              <div className="stepper">
                <span className="active">1</span>
                <i />
                <span className={bookingStep > 1 ? 'active' : ''}>2</span>
              </div>
              {bookingStep === 1 ? (
                <>
                  <p className="muted">Enter your contact and installation details to continue with your selected plan.</p>
                  <label>Full name <span className="required">*</span></label>
                  <input value={bookingFullName} onChange={e => setBookingFullName(e.target.value.slice(0, 100))} placeholder="Enter your full name" autoComplete="name" />
                  <label htmlFor="booking-mobile">Mobile number <span className="required">*</span></label>
                  <div className="phone-input">
                    <span>🇮🇳 +91</span>
                    <input id="booking-mobile" className="phone-number-field" type="tel" inputMode="numeric" autoComplete="tel-national" value={bookingPhone} onChange={e => setBookingPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="10-digit mobile number" />
                  </div>
                  <div className="booking-otp-panel">
                    <div className="otp-panel-heading">
                      <span className="otp-preview-icon"><ShieldCheck size={17} /></span>
                      <div><b>Mobile confirmation</b><small>Verified by K&amp;B before activation</small></div>
                    </div>
                    <p className="otp-panel-copy">Live SMS OTP is not configured yet. You can submit a connection request now; the K&amp;B team will contact you to confirm your mobile number before service activation. Never share an OTP or password in this form.</p>
                  </div>
                  <label>State <span className="required">*</span></label>
                  <input value={bookingState} onChange={e => setBookingState(e.target.value)} placeholder="Enter state" autoComplete="address-level1" />
                  <label>City <span className="required">*</span></label>
                  <input value={bookingCity} onChange={e => setBookingCity(e.target.value)} placeholder="Enter city" autoComplete="address-level2" />
                  <label>PIN code <span className="required">*</span></label>
                  <input inputMode="numeric" maxLength={6} value={bookingPincode} onChange={e => setBookingPincode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6-digit PIN code" autoComplete="postal-code" />
                  <label>Full address <span className="required">*</span></label>
                  <textarea value={bookingAddress} onChange={e => setBookingAddress(e.target.value)} placeholder="House / flat number, building, street, area or landmark" autoComplete="street-address" />
                  <label>Additional requirements <span className="muted-inline">(optional)</span></label>
                  <textarea value={bookingMessage} onChange={e => setBookingMessage(e.target.value)} placeholder="Any installation preference or additional information?" />
                  <button className="primary-button full" onClick={() => {
                    if (!bookingFullName.trim() || !/^\d{10}$/.test(bookingPhone) || !bookingState.trim() || !bookingCity.trim() || !/^\d{6}$/.test(bookingPincode) || bookingAddress.trim().length < 8) {
                      toast('Please complete all required booking fields.');
                      return;
                    }
                    setBookingStep(3);
                  }}>Continue to payment options <ChevronRight /></button>
                </>
              ) : (
                <>
                  <div className="success-note">
                    <CheckCircle2 /> Review your selected plan and choose a payment method.
                  </div>
                  <div className="booking-review-card">
                    <span>CUSTOMER</span>
                    <b>{bookingFullName} · +91 {bookingPhone}</b>
                    <span>INSTALLATION ADDRESS</span>
                    <b>{bookingAddress}, {bookingCity}, {bookingState} - {bookingPincode}</b>
                    {bookingMessage.trim() && <><span>ADDITIONAL REQUIREMENTS</span><b>{bookingMessage}</b></>}
                    <span>SELECTED PLAN</span>
                    <b>{selectedPlan.name} · {selectedPlan.speed} · {money(selectedPlan.price)} / 30 days</b>
                  </div>
                                    <p className="fine-print">K&amp;B must confirm coverage, final charges and installation details before service activation. This preview does not send a booking to K&amp;B.</p>
                  <label className="terms-check">
                    <input
                      type="checkbox"
                      checked={bookingTermsAccepted}
                      onChange={e => setBookingTermsAccepted(e.target.checked)}
                    />
                    <span>I have reviewed the official K&B booking terms and conditions.</span>
                  </label>
                  <button type="button" className="terms-inline-link" onClick={() => setModal('terms')}>
                    Read K&B privacy, refund, terms & data security policies <ArrowUpRight size={14} />
                  </button>
                  <div className="booking-payment-choice">
                    <b>Choose how you want to pay</b>
                    <p>Payment choice is collected after your booking details. The amount below is a preview and must be confirmed by K&amp;B.</p>
                    <div className="payment-choice-grid">
                      <button type="button" className="payment-choice-card unavailable" disabled>
                        <CreditCard size={20} />
                        <span><b>Online payment · UPI</b><small>Open Google Pay, PhonePe, Paytm or another installed UPI app</small><em>Merchant UPI ID setup pending</em></span>
                      </button>
                      <button type="button" className={'payment-choice-card' + (bookingPaymentChoice === 'cash' ? ' selected' : '')} onClick={() => setBookingPaymentChoice('cash')}>
                        <ReceiptText size={20} />
                        <span><b>Cash after installation</b><small>Pay the technician / K&amp;B team after installation</small><em>Invoice will show UNPAID until K&amp;B confirms receipt</em></span>
                      </button>
                    </div>
                    <div className="booking-payable-preview">
                      <span>Selected plan · {selectedPlan.name}</span>
                      <span>Plan amount <b>{money(selectedPlan.price)}</b></span>
                      <span>CGST · 9% <b>{money(bookingCgstAmount)}</b></span>
                      <span>SGST · 9% <b>{money(bookingSgstAmount)}</b></span>
                      <strong>Total shown for review <b>{money(bookingTotalAmount)}</b></strong>
                    </div>
                  </div>
                  <button
                    className="primary-button full"
                    disabled={bookingSubmitting}
                    onClick={() => {
                      if (!bookingTermsAccepted) {
                        toast('Please review and acknowledge the K&B terms first.');
                        return;
                      }
                      if (!bookingPaymentChoice) {
                        toast('Please choose a payment method.');
                        return;
                      }
                      if (bookingPaymentChoice === 'upi') {
                        toast('Online UPI will be enabled after the verified merchant UPI ID and payment verification are configured.');
                        return;
                      }
                      void submitConnectionRequest();
                    }}
                  >
                    {bookingSubmitting ? 'Sending request…' : 'Submit connection request'} <ChevronRight />
                  </button>
                  <p className="fine-print">Submitting sends a pending connection request to K&amp;B Management Nexus. The selected cash-after-installation preference is not a payment. An authorised K&amp;B administrator must review the request and create the customer and installation records. Online UPI remains disabled until verified merchant payment processing is configured.</p>
                </>
              )}
                </>
              )}
            </div>
          )}
          {modal === 'complaint' && (
            <div className="modal-content">
              {complaintSent ? (
                <div className="submitted-state">
                  <span><CheckCircle2 size={38} /></span>
                  <h3>Support request received</h3>
                  <p>{complaintMessage}</p>
                  <p className="fine-print">K&B may contact you to verify the account before taking action. This confirmation does not mean the issue has been resolved.</p>
                  <button className="primary-button full" onClick={close}>Done</button>
                </div>
              ) : (
                <>
                  <p className="muted">Enter the mobile number registered with K&B, describe the issue and attach a clear router or modem photo. Requests are matched to active accounts by the management system.</p>
                  <label>Registered mobile number <span className="required">*</span></label>
                  <div className="phone-input">
                    <span>🇮🇳 +91</span>
                    <input className="phone-number-field" type="tel" inputMode="numeric" value={complaintPhone} onChange={e => setComplaintPhone(e.target.value.replace(/\\D/g, '').slice(0, 10))} placeholder="10-digit mobile number" />
                  </div>
                  <label>Issue category</label>
                  <select value={complaintType} onChange={e => setComplaintType(e.target.value)}>
                    {['No internet','Slow internet','Frequent disconnection','Router / modem issue','Wi-Fi issue','IPTV issue','Billing','Other'].map(x => <option key={x}>{x}</option>)}
                  </select>
                  <label>Describe your issue</label>
                  <textarea value={complaintText} onChange={e => setComplaintText(e.target.value)} placeholder="Tell us what is happening..." maxLength={1500} />
                  <label>Router / modem photo <span className="required">*</span></label>
                  <label className="upload-box">
                    <Camera size={23} />
                    <b>{photoName || 'Add a router or modem photo'}</b>
                    <small>JPG, PNG or WebP · Maximum 2 MB</small>
                    <input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => {
                      const file = e.target.files?.[0] || null;
                      if (file && (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024)) {
                        toast('Choose a JPG, PNG or WebP photo up to 2 MB.');
                        e.target.value = '';
                        setComplaintPhoto(null);
                        setPhotoName('');
                        return;
                      }
                      setComplaintPhoto(file);
                      setPhotoName(file?.name || '');
                    }} />
                    <span className="upload-action"><Upload size={15} /> Choose photo</span>
                  </label>
                  <button className="primary-button full" disabled={complaintSubmitting} onClick={() => void submitComplaint()}>
                    {complaintSubmitting ? 'Sending support request…' : 'Submit complaint'} <ChevronRight />
                  </button>
                  <p className="fine-print">Your photo is uploaded securely to K&B Management Nexus only when the server accepts the request. A generic confirmation is used to protect customer account privacy.</p>
                </>
              )}
            </div>
          )}
          {modal === 'notifications' && (
            <div className="modal-content">
              <div className="notification-row">
                <span className="quick-icon green">
                  <CheckCircle2 />
                </span>
                <div>
                  <b>Sample connection status</b>
                  <small>Preview content only · Not live network telemetry.</small>
                </div>
              </div>
              <div className="notification-row">
                <span className="quick-icon violet">
                  <CalendarDays />
                </span>
                <div>
                  <b>Sample renewal reminder</b>
                  <small>Example date only · Confirm renewal with K&B.</small>
                </div>
              </div>
              <div className="notification-row">
                <span className="quick-icon blue">
                  <Ticket />
                </span>
                <div>
                  <b>Ticket #KB-1038 updated</b>
                  <small>No live ticket is connected to this preview.</small>
                </div>
              </div>
            </div>
          )}
          {modal === 'payments' && (
            <div className="modal-content">
              {demoInvoice ? (
                <>
                  <div className="invoice-print">
                    <div className="invoice-brand">
                      <div><b>K&B NET SERVICE</b><small>Internet service invoice · DEMO</small></div>
                      <span className={'invoice-stamp ' + (demoInvoice.paymentStatus === 'PAID' ? 'paid' : 'unpaid')}>{demoInvoice.paymentStatus}</span>
                    </div>
                    <h3>TAX INVOICE PREVIEW</h3>
                    <div className="invoice-seller">
                      <b>K&B Net Service</b>
                      <span>B-8/10 Gokul Galaxy Residency, Kathwada, Ahmedabad, Gujarat - 382430</span>
                      <span>GSTIN: 24AHHPC7437K1ZA</span>
                      <span>Customer support: 079-29992999</span>
                      <span>Bank IFSC: VCOB0000018</span>
                    </div>
                    <div className="invoice-meta">
                      <span>Invoice number<strong>{demoInvoice.invoiceNo}</strong></span>
                      <span>Invoice date<strong>{demoInvoice.paidAt}</strong></span>
                      <span>Payment method<strong>{demoInvoice.paymentMethod}</strong></span>
                      <span>Place of supply<strong>{bookingState || 'Not provided'}</strong></span>
                    </div>
                    <div className="invoice-customer">
                      <small>BILL TO</small>
                      <b>{demoInvoice.customerName}</b>
                      <span>Mobile: {demoInvoice.mobile || 'Not provided'}</span>
                      <span>Billing address: {[bookingAddress, bookingCity, bookingState, bookingPincode].filter(Boolean).join(', ') || 'Not provided in demo profile'}</span>
                      <span>Customer ID: KB-20481 (sample)</span>
                    </div>
                    <div className="invoice-line invoice-base-row"><span>{demoInvoice.planName} · 30 days (taxable value)</span><b>{money(demoInvoice.base)}</b></div>
                    <div className="invoice-tax-breakdown" aria-label="Separate GST breakdown">
                      <div className="invoice-line"><span>CGST · 9%</span><b>{money(demoInvoice.base * 0.09)}</b></div>
                      <div className="invoice-line"><span>SGST · 9%</span><b>{money(demoInvoice.base * 0.09)}</b></div>
                    </div>
                    <div className="invoice-total"><span>Total amount</span><strong>{money(demoInvoice.total)}</strong></div>
                    <p className="invoice-note">{demoInvoice.paymentStatus === 'UNPAID' ? 'UNPAID: Cash is due after installation. This invoice must remain unpaid until an authorised K&B admin records and confirms the cash receipt in Management Nexus. This preview is not synced to the admin portal and is not proof of payment.' : 'PAID status requires verified payment confirmation from the live billing system.'} This is a preview invoice, not a valid GST tax invoice. Final invoice numbering, tax treatment, customer billing data and payment confirmation must come from the live Management Nexus billing system.</p>
                  </div>
                  <button className="primary-button full" onClick={() => window.print()}><ReceiptText /> Print / Save invoice</button>
                  <button className="appearance-toggle" onClick={() => setDemoInvoice(null)}>Back to payment demo</button>
                </>
              ) : (
                <>
                  <div className="payment-demo-banner">
                    <CreditCard />
                    <div><b>Fixed payment preview</b><small>Amount is calculated by the portal and cannot be edited by the customer.</small></div>
                  </div>
                  <div className="payment-timing-card"><b>Payment timing</b><p>Pay after K&B confirms coverage, the final plan price and installation schedule.</p><small>Your payment request will appear in My Payments / Billing.</small></div>
                  <div className="bill-summary">
                    <span>Plan amount</span><b>K&B Fiber 499 · 50 Mbps</b>
                    <span>Taxable value</span><strong>{money(demoBaseAmount)}</strong>
                    <div className="bill-tax-lines">
                      <div><span>CGST · 9%</span><strong>{money(demoCgstAmount)}</strong></div>
                      <div><span>SGST · 9%</span><strong>{money(demoSgstAmount)}</strong></div>
                    </div>
                    <span className="payable-label">Fixed total payable</span><strong className="payable-amount">{money(demoTotalAmount)}</strong>
                  </div>
                  <div className="payment-recipient">
                    <span>Invoice issuer</span>
                    <b>K&amp;B Net Service · GSTIN 24AHHPC7437K1ZA</b>
                    <small>B-8/10 Gokul Galaxy Residency, Kathwada, Ahmedabad, Gujarat - 382430 · Support: 079-29992999. Demo payment only; no UPI ID or bank account number is configured here.</small>
                  </div>
                  <div className="payment-setup-note"><AlertCircle size={17} /><p><b>Online UPI is not active yet.</b> The merchant UPI ID and server-side payment verification still need to be configured. This preview will not mark an invoice PAID without verified payment confirmation.</p></div>
                </>
              )}
            </div>
          )}
          {modal === 'faq' && (
            <div className="modal-content faq-list">
              {[
                'How can I renew my internet plan?',
                'What should I do if my internet is not working?',
                'How do I track a complaint?',
                'Can I change my current plan?',
              ].map((q, i) => (
                <button
                  key={q}
                  className="faq-item"
                  onClick={() => setFaqOpen(faqOpen === i ? -1 : i)}
                >
                  <b>{q}</b>
                  <ChevronRight className={faqOpen === i ? 'rotated' : ''} />
                  {faqOpen === i && (
                    <p>
                      {
                        [
                          'Open My Connection or tap Renew plan, then follow the payment steps.',
                          'Check that your router is powered on and cables are connected. If the issue continues, raise a complaint with a router photo.',
                          'Open Support to view your ticket number, status and latest updates.',
                          'Explore available plans and submit a plan-change request. K&B will confirm availability.',
                        ][i]
                      }
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <LanguageLayer language={language}>
    <div className={'app-shell theme-' + appearance + (activeFestival !== 'none' ? ' festival-' + activeFestival : '')}>
      {activeFestival !== 'none' && (
        <div className={'festival-decoration festival-decoration-' + activeFestival} aria-live="polite">
          <span>✦</span>
          <b>{activeFestival === 'diwali' ? 'Diwali celebration' : activeFestival === 'holi' ? 'Holi celebration' : activeFestival === 'navratri' ? 'Navratri celebration' : activeFestival === 'christmas' ? 'Christmas celebration' : 'New Year celebration'}</b>
          <small>{activeFestival === 'diwali' ? 'Wishing you light and happiness' : activeFestival === 'holi' ? 'Wishing you a colourful celebration' : activeFestival === 'navratri' ? 'Wishing you a joyful Navratri' : activeFestival === 'christmas' ? 'Wishing you a joyful Christmas' : 'Wishing you a happy New Year'}</small>
          <span>✧</span>
        </div>
      )}
      <SiteHeader language={language} onLanguageChange={next => { setLanguage(next); window.localStorage.setItem('kb-customer-language', next); document.documentElement.lang = next; }} appearance={appearance} onToggleAppearance={() => setAppearance(current => current === 'light' ? 'dark' : 'light')} onOpenNotifications={() => setModal('notifications')} onGoHome={() => setTab('Home')} onGoAccount={() => setTab('Account')} />
      <main className="main-layout">
        <aside className="desktop-nav" aria-label="Customer navigation">
          <div className="nav-caption">CUSTOMER MENU</div>
          {navItems.map(({ label, icon: Icon }) => (
            <button
              key={label}
              className={tab === label ? 'selected' : ''}
              onClick={() => setTab(label)}
            >
              <Icon size={19} />
              {label}
              {tab === label && <span />}
            </button>
          ))}
          <div className="sidebar-help">
            <div className="help-orb">
              <Headphones />
            </div>
            <b>Need help?</b>
            <p>Our support team is ready.</p>
            <button onClick={() => setTab('Support')}>
              Get support <ArrowUpRight size={14} />
            </button>
          </div>
          <div className="sidebar-foot">
            K&B NET SERVICE
            <br />
            K&B Customer Nexus
          </div>
        </aside>
        <div className="content-area">
          <div className="mobile-greeting">
            <span>YOUR CONNECTION, YOUR WAY</span>
            <button onClick={() => setModal('login')}>
              <Smartphone size={15} /> Sign in
            </button>
          </div>
          {renderScreen()}
        </div>
      </main>
      <nav className="bottom-nav" aria-label="Customer navigation">
        {navItems.map(({ label, icon: Icon }) => (
          <button
            key={label}
            className={tab === label ? 'active' : ''}
            onClick={() => setTab(label)}
          >
            <Icon size={20} />
            <span>{label === 'My Connection' ? 'Connection' : label}</span>
          </button>
        ))}
      </nav>
      <button
        className="advisor-fab"
        onClick={() => setModal('advisor')}
        aria-label="Open K&B AI plan advisor"
        title="Ask K&B AI plan advisor"
      >
        <Sparkles size={22} />
      </button>
      {portalContent.promo.active && !floatingOfferDismissed && (tab === 'Home' || tab === 'Explore') && (
        <aside className="kb-floating-offer" aria-label="K&B promotional offer">
          <button className="kb-floating-offer-close" type="button" onClick={() => setFloatingOfferDismissed(true)} aria-label="Dismiss promotion">
            <X size={16} />
          </button>
          <span className="kb-floating-offer-kicker"><Sparkles size={12} /> {portalContent.promo.badge}</span>
          <b>{portalContent.promo.title}</b>
          <p>{portalContent.promo.body}</p>
          <button className="kb-floating-offer-cta" type="button" onClick={() => { setFloatingOfferDismissed(true); setTab('Explore'); }}>
            {portalContent.promo.cta} <ArrowUpRight size={15} />
          </button>
        </aside>
      )}
      {ModalView()}
      {notice && (
        <div className="toast">
          <CheckCircle2 size={17} />
          {notice}
        </div>
      )}
      <footer className="site-footer">
        <span>© 2026 K&B NET SERVICE</span>
        <button className="footer-terms-link" onClick={() => setModal('terms')}>
          Terms & booking <ArrowUpRight size={13} />
        </button>
        <a
          href="https://www.kandbnetservice.in/"
          target="_blank"
          rel="noreferrer"
        >
          Official website <ArrowUpRight size={13} />
        </a>
        <span>Customer portal preview</span>
      </footer>
    </div>
    </LanguageLayer>
  );
}

export default App;
