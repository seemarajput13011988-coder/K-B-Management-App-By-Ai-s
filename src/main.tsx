import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import App from './App';
import './index.css';
import './mobile-overhaul.css';
import './dashboard/overview.css';

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
  screen.setAttribute('aria-live', 'polite');
  screen.style.cssText = 'min-height:100dvh;display:grid;align-content:center;justify-items:center;gap:18px;padding:28px;background:#f4f7fb;color:#17243a;font-family:system-ui,sans-serif;text-align:center';
  const mark = document.createElement('div');
  mark.textContent = 'K&B';
  mark.setAttribute('aria-label', 'K&B NET SERVICE');
  mark.style.cssText = 'display:grid;place-items:center;width:76px;height:76px;border-radius:22px;background:linear-gradient(145deg,#ffbd68,#e57b2b);box-shadow:0 12px 40px #f09a4b55;color:#fff;font-size:23px;font-weight:900';
  const title = document.createElement('h1');
  title.textContent = 'K&B Management Nexus';
  title.style.cssText = 'font-size:21px;margin:0';
  const detail = document.createElement('p');
  detail.textContent = message;
  detail.style.cssText = 'max-width:320px;margin:0;color:#64748b;line-height:1.55;font-size:14px';
  const gauge = document.createElement('div');
  gauge.style.cssText = 'width:132px;height:132px;border-radius:50%;display:grid;place-items:center;background:conic-gradient(#e57b2b 0deg,#e2e8f0 0deg);transition:background .18s ease';
  const gaugeInner = document.createElement('div');
  gaugeInner.style.cssText = 'width:112px;height:112px;border-radius:50%;background:#fff;display:grid;align-content:center;justify-items:center;box-shadow:inset 0 0 0 1px #e2e8f0';
  const percent = document.createElement('strong');
  percent.textContent = '0%';
  percent.style.cssText = 'font-size:30px;line-height:1.1;font-variant-numeric:tabular-nums;color:#17243a';
  const gaugeCaption = document.createElement('span');
  gaugeCaption.textContent = 'DOWNLOAD';
  gaugeCaption.style.cssText = 'font-size:10px;letter-spacing:1.5px;font-weight:800;color:#64748b;margin-top:5px';
  gaugeInner.append(percent, gaugeCaption);
  gauge.append(gaugeInner);
  const progressTrack = document.createElement('div');
  progressTrack.style.cssText = 'width:min(320px,82vw);height:9px;border-radius:99px;background:#e2e8f0;overflow:hidden';
  const progressFill = document.createElement('div');
  progressFill.style.cssText = 'height:100%;width:0%;border-radius:99px;background:linear-gradient(90deg,#f5a34d,#e57b2b);transition:width .18s ease';
  progressTrack.append(progressFill);
  const progressLabel = document.createElement('p');
  progressLabel.textContent = 'Waiting for download progress…';
  progressLabel.style.cssText = 'margin:-8px 0 0;color:#64748b;font-size:12px;font-variant-numeric:tabular-nums';
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Retry';
  button.style.cssText = 'border:0;border-radius:10px;background:#1d4ed8;color:white;padding:12px 22px;font-weight:700;font-size:14px';
  button.addEventListener('click', () => {
    button.disabled = true;
    button.textContent = 'Checking…';
    retry();
  });
  screen.append(mark, title, detail, gauge, progressTrack, progressLabel, button);
  appRoot.append(screen);
  return {
    setMessage(next: string) { detail.textContent = next; },
    setProgress(value: number) {
      const safe = Math.max(0, Math.min(100, Math.round(value)));
      percent.textContent = safe + '%';
      progressFill.style.width = safe + '%';
      gauge.style.background = 'conic-gradient(#e57b2b ' + (safe * 3.6) + 'deg,#e2e8f0 ' + (safe * 3.6) + 'deg)';
      progressLabel.textContent = safe >= 100 ? 'Download complete' : 'Downloaded ' + safe + '%';
    },
  };
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

    const updateScreen = showUpdateScreen('A new version is available. Preparing secure download…', () => {
      void runUpdateCheck();
    });

    // Keep the currently installed bundle marked healthy before attempting a switch.
    await CapacitorUpdater.notifyAppReady();
    let downloadListener: { remove: () => Promise<void> } | undefined;
    try {
      downloadListener = await CapacitorUpdater.addListener('download', event => {
        updateScreen.setMessage('Downloading update ' + latest.version + '. Keep the app open and your internet connected.');
        updateScreen.setProgress(event.percent);
      });
    } catch (listenerError) {
      // Progress UI remains visible even if this plugin build cannot attach the optional listener.
      console.warn('K&B OTA progress listener could not be attached:', listenerError);
    }
    let bundle;
    try {
      bundle = await withTimeout(
        CapacitorUpdater.download({
          url: latest.url,
          version: latest.version,
          ...(latest.checksum ? { checksum: latest.checksum } : {}),
        }),
        UPDATE_DOWNLOAD_TIMEOUT_MS,
        'The update download timed out. Opening the last working version.',
      );
    } finally {
      if (downloadListener) await downloadListener.remove().catch(() => undefined);
    }
    updateScreen.setProgress(100);
    updateScreen.setMessage('Download complete. Installing the verified update…');
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
