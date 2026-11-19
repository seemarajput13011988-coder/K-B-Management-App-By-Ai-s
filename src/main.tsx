import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import App from './App';
import './index.css';
import './mobile-overhaul.css';
import './dashboard/overview.css';
import './app-redesign.css';

const UPDATE_CHECK_TIMEOUT_MS = 25000;
const UPDATE_DOWNLOAD_TIMEOUT_MS = 120000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      value => { window.clearTimeout(timer); resolve(value); },
      error => { window.clearTimeout(timer); reject(error); },
    );
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('K&B Nexus root element is missing.');
const appRoot: HTMLElement = rootElement;

function NativeReadinessSignal() {
  useEffect(() => {
    void CapacitorUpdater.notifyAppReady().catch(error => {
      console.error('K&B Nexus app readiness confirmation failed:', error);
    });
  }, []);
  return null;
}

function mountApp(native = false) {
  createRoot(appRoot).render(
    <StrictMode>
      <App />
      {native ? <NativeReadinessSignal /> : null}
    </StrictMode>,
  );
}

function showUpdateScreen(message: string, retry: () => void) {
  appRoot.replaceChildren();
  const screen = document.createElement('main');
  screen.setAttribute('role', 'status');
  screen.style.cssText = 'min-height:100dvh;display:grid;place-content:center;justify-items:center;gap:14px;padding:28px;background:#f4f7fb;color:#17243a;font-family:system-ui,sans-serif;text-align:center';
  const mark = document.createElement('div');
  mark.setAttribute('aria-label', 'K&B NET SERVICE');
  mark.style.cssText = 'display:grid;place-items:center;width:82px;height:82px;border-radius:25px;background:linear-gradient(145deg,#ffc15e,#ed842c);box-shadow:0 14px 34px rgba(237,132,44,.24);color:#fff;font-size:23px;font-weight:900;letter-spacing:-1.5px;border:1px solid rgba(255,255,255,.65)';
  mark.textContent = 'K&B';
  const title = document.createElement('h1');
  title.textContent = 'K&B NET SERVICE';
  title.style.cssText = 'font-size:21px;margin:0';
  const detail = document.createElement('p');
  detail.textContent = message;
  detail.style.cssText = 'max-width:320px;margin:0;color:#64748b;line-height:1.55;font-size:14px';
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Retry';
  button.style.cssText = 'border:0;border-radius:12px;background:linear-gradient(135deg,#347cdb,#2258ad);color:white;padding:12px 22px;font-weight:750;font-size:14px';
  button.addEventListener('click', () => {
    button.disabled = true;
    button.textContent = 'Checking…';
    retry();
  });
  screen.append(mark, title, detail, button);
  appRoot.append(screen);
}

async function runUpdateCheck(): Promise<void> {
  try {
    const latest = await withTimeout(
      CapacitorUpdater.getLatest(),
      UPDATE_CHECK_TIMEOUT_MS,
      'The update check timed out. Opening the last working version.',
    );
    if (!latest?.url || !latest.version) {
      mountApp(true);
      return;
    }

    showUpdateScreen('A new version is available. Installing it now…', () => {
      void runUpdateCheck();
    });

    // Keep the currently installed bundle marked healthy before attempting a switch.
    await CapacitorUpdater.notifyAppReady();
    const bundle = await withTimeout(
      CapacitorUpdater.download({
        url: latest.url,
        version: latest.version,
        ...(latest.checksum ? { checksum: latest.checksum } : {}),
      }),
      UPDATE_DOWNLOAD_TIMEOUT_MS,
      'The update download timed out. Opening the last working version.',
    );
    await CapacitorUpdater.set(bundle);
  } catch (error) {
    // An unavailable update service must never lock staff out of the last working app.
    console.error('K&B Nexus OTA check/install failed; opening the last working app:', error);
    mountApp(true);
  }
}

async function bootstrap() {
  if (!Capacitor.isNativePlatform()) {
    mountApp();
    return;
  }
  await runUpdateCheck();
}

void bootstrap();
