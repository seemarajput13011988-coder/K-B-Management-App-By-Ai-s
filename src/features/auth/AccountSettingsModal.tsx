import { useState } from 'react';
import type { FormEvent } from 'react';
import { Bell, CircleHelp } from 'lucide-react';
import type { Session } from '../../lib/session';
import { Field } from '../../ui/Field';
import { Modal } from '../../ui/Modal';

export function AccountSettingsModal({ session, onClose, onChangeUserId, onChangePassword, language, setLanguage, theme, toggleTheme, onEnableNotifications, onHelp }: { session: Session; onClose: () => void; onChangeUserId: (currentPassword: string, userId: string) => Promise<void>; onChangePassword: (currentPassword: string, newPassword: string) => Promise<void>; language: 'en' | 'hi' | 'gu'; setLanguage: (language: 'en' | 'hi' | 'gu') => void; theme: string; toggleTheme: () => void; onEnableNotifications: () => Promise<void>; onHelp: () => void }) {
  const [currentPasswordForUserId, setCurrentPasswordForUserId] = useState('');
  const [currentPasswordForPassword, setCurrentPasswordForPassword] = useState('');
  const [newUserId, setNewUserId] = useState(session.user.userId);
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function submitUserId(e: FormEvent) {
    e.preventDefault(); setBusy(true); setMessage('');
    try { await onChangeUserId(currentPasswordForUserId, newUserId); }
    catch (err) { setMessage(err instanceof Error ? err.message : 'Could not change user ID.'); setBusy(false); }
  }
  async function submitPassword(e: FormEvent) {
    e.preventDefault(); setBusy(true); setMessage('');
    try { await onChangePassword(currentPasswordForPassword, newPassword); }
    catch (err) { setMessage(err instanceof Error ? err.message : 'Could not change password.'); setBusy(false); }
  }
  return <Modal title="My account" subtitle={'Signed in as ' + session.user.displayName + ' · ' + session.user.role} onClose={onClose}>
    <div className="form-grid">
      <section className="account-preferences">
        <strong>App preferences</strong>
        <label className="field"><span>Language</span><select value={language} onChange={event => setLanguage(event.target.value as 'en' | 'hi' | 'gu')}><option value="en">English</option><option value="hi">हिन्दी</option><option value="gu">ગુજરાતી</option></select></label>
        <button type="button" className="btn secondary" onClick={toggleTheme}>{theme === 'dark' ? '☀️ Switch to day mode' : '🌙 Switch to night mode'}</button>
        <button type="button" className="btn secondary" onClick={() => void onEnableNotifications()}><Bell size={15}/> Enable notifications</button>
        <button type="button" className="btn secondary" onClick={onHelp}><CircleHelp size={15}/> Help centre</button>
      </section>
      <form className="form-grid" onSubmit={submitUserId}>
        <Field label="Current password"><input type="password" required value={currentPasswordForUserId} onChange={e => setCurrentPasswordForUserId(e.target.value)} autoComplete="current-password" /></Field>
        <Field label="New user ID"><input required minLength={3} maxLength={32} pattern="[a-zA-Z0-9_-]{3,32}" value={newUserId} onChange={e => setNewUserId(e.target.value)} /></Field>
        <div className="form-actions"><button className="btn primary" disabled={busy || newUserId.trim().toLowerCase() === session.user.userId.toLowerCase()}>{busy ? 'Saving…' : 'Change username'}</button></div>
      </form>
      <div className="form-hint">Changing your username signs you out. Sign in again with the new ID.</div>
      <form className="form-grid" onSubmit={submitPassword}>
        <Field label="Current password"><input type="password" required value={currentPasswordForPassword} onChange={e => setCurrentPasswordForPassword(e.target.value)} autoComplete="current-password" /></Field>
        <Field label="New password"><input type="password" required minLength={10} value={newPassword} onChange={e => setNewPassword(e.target.value)} autoComplete="new-password" /></Field>
        {message && <div className="auth-message">{message}</div>}
        <div className="form-actions"><button className="btn primary" disabled={busy || !newPassword}>{busy ? 'Saving…' : 'Change password'}</button><button type="button" className="btn secondary" onClick={onClose}>Close</button></div>
      </form>
    </div>
  </Modal>;
}
