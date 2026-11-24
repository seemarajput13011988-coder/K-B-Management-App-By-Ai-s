import { useEffect, useState } from 'react';
import { api as client, signInAppUser, signOutAppUser } from './lib/api';
import { clearSession, getSession, saveSession, type Session } from './lib/session';
import { LoginScreen } from './features/auth/LoginScreen';
import { Workspace } from './features/workspace/Workspace';

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [minSplashDone, setMinSplashDone] = useState(false);
  const [maxSplashReached, setMaxSplashReached] = useState(false);

  useEffect(() => {
    const min = window.setTimeout(() => setMinSplashDone(true), 900);
    const max = window.setTimeout(() => setMaxSplashReached(true), 1200);
    return () => { window.clearTimeout(min); window.clearTimeout(max); };
  }, []);

  useEffect(() => {
    let live = true;
    async function restore() {
      const old = getSession();
      if (!old) { setChecking(false); return; }
      try {
        const result = await client.get('/api/auth/me');
        if (live) {
          const restored = { ...old, user: result.data.user };
          saveSession(restored);
          setSession(restored);
        }
      } catch {
        clearSession();
      } finally {
        if (live) setChecking(false);
      }
    }
    void restore();
    return () => { live = false; };
  }, []);

  async function login(userId: string, password: string, expectedRole: 'admin' | 'staff') {
    const next = await signInAppUser(userId, password, expectedRole) as Session;
    if (next.user.role !== expectedRole) {
      await signOutAppUser();
      throw new Error(expectedRole === 'admin'
        ? 'This account is not an admin account. Choose Staff Sign In instead.'
        : 'This account is not a staff account. Choose Admin Sign In instead.');
    }
    saveSession(next);
    setSession(next);
  }

  if (!minSplashDone || (checking && !maxSplashReached)) {
    return <div className="loading-cover">
      <div className="loading-brand-mark" aria-label="K&B NET SERVICE">K&amp;B</div>
      <strong className="loading-brand-name">K&amp;B NET SERVICE</strong>
      <div className="loader" />
      <span>Preparing your secure workspace…</span>
    </div>;
  }

  return session
    ? <Workspace session={session} onLogout={() => {
        void signOutAppUser().catch(() => undefined);
        clearSession();
        setSession(null);
      }} />
    : <LoginScreen onLogin={login} />;
}

export default App;
