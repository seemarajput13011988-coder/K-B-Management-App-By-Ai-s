import { Bell, Globe, Moon, Sun, Wifi } from 'lucide-react';
import type { Language } from '../i18n/LanguageLayer';
type Props = { language: Language; onLanguageChange: (language: Language) => void; appearance: 'light' | 'dark'; onToggleAppearance: () => void; onOpenNotifications: () => void; onGoHome: () => void; onGoAccount: () => void; };
export default function SiteHeader({ language, onLanguageChange, appearance, onToggleAppearance, onOpenNotifications, onGoHome, onGoAccount }: Props) {
  return (
    <header className="topbar">
      <button className="brand" type="button" onClick={onGoHome} aria-label="K&B home">
        <span className="brand-mark"><Wifi size={22} /></span>
        <span><b>K&B Customer Nexus</b><small>POWERED BY K&B NET SERVICE</small></span>
      </button>
      <div className="header-actions">
        <span className="online-pill preview-pill"><i aria-hidden="true" /> Portal preview</span>
        <label className="language-picker" aria-label="Language">
          <Globe size={15} aria-hidden="true" />
          <select value={language} aria-label="Language" onChange={event => onLanguageChange(event.target.value as Language)}>
            <option value="en">English</option><option value="hi">हिन्दी</option><option value="gu">ગુજરાતી</option>
          </select>
        </label>
        <button className="icon-btn" type="button" onClick={onToggleAppearance} aria-label={appearance === 'light' ? 'Switch to night mode' : 'Switch to day mode'} title={appearance === 'light' ? 'Night mode' : 'Day mode'}>
          {appearance === 'light' ? <Moon size={18} /> : <Sun size={18} />}
        </button>
        <button className="icon-btn" type="button" onClick={onOpenNotifications} aria-label="Notifications"><Bell size={19} /><em /></button>
        <button className="avatar" type="button" onClick={onGoAccount} aria-label="Open account">K</button>
      </div>
    </header>
  );
}