import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import App from './App';
import { ConfirmProvider } from './ui/ConfirmDialog';
import './styles/tokens.css';
import './styles/base.css';
import './index.css';
import './mobile-overhaul.css';
import './dashboard/overview.css';
import './app-redesign.css';
import './mobile-native-shell.css';
import './styles/components.css';
import './ui/shell.css';

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
      <ConfirmProvider>
        <App />
        {native ? <NativeReadinessSignal /> : null}
      </ConfirmProvider>
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
  const progressTrack = document.createElement('div');
  progressTrack.setAttribute('aria-label', 'Update download progress');
  progressTrack.style.cssText = 'width:min(320px,78vw);height:9px;overflow:hidden;border-radius:999px;background:#dbe4f0';
  const progressFill = document.createElement('div');
  progressFill.style.cssText = 'display:block;width:0%;height:100%;border-radius:999px;background:linear-gradient(90deg,#2f7dd5,#32a36b);transition:width .18s ease';
  progressTrack.append(progressFill);
  const progressLabel = document.createElement('p');
  progressLabel.textContent = 'Preparing download… 0%';
  progressLabel.style.cssText = 'margin:0;color:#52657c;font-size:13px;font-weight:700;font-variant-numeric:tabular-nums';
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Downloading update…';
  button.disabled = true;
  button.style.cssText = 'border:0;border-radius:12px;background:linear-gradient(135deg,#347cdb,#2258ad);color:white;padding:12px 22px;font-weight:750;font-size:14px';
  button.addEventListener('click', () => {
    button.disabled = true;
    button.textContent = 'Checking…';
    retry();
  });
  const openCurrent = document.createElement('button');
  openCurrent.type = 'button';
  openCurrent.textContent = 'Open current version';
  openCurrent.hidden = true;
  openCurrent.style.cssText = 'border:1px solid #cbd5e1;border-radius:12px;background:transparent;color:#334155;padding:11px 18px;font-weight:700;font-size:14px';
  openCurrent.addEventListener('click', () => mountApp(true));
  screen.append(mark, title, detail, progressTrack, progressLabel, button, openCurrent);
  appRoot.append(screen);
  return {
    setProgress(percent: number) {
      const value = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
      progressFill.style.width = value + '%';
      progressLabel.textContent = 'Downloading update… ' + value + '%';
    },
    showFailure(reason: string) {
      detail.textContent = reason;
      progressTrack.hidden = true;
      progressLabel.hidden = true;
      button.disabled = false;
      button.textContent = 'Retry update';
      openCurrent.hidden = false;
    },
  };
}

let updateRunInProgress = false;

async function runUpdateCheck(): Promise<void> {
  if (updateRunInProgress) return;
  updateRunInProgress = true;
  let updateScreen: ReturnType<typeof showUpdateScreen> | null = null;
  let progressListener: { remove: () => Promise<void> } | null = null;
  try {
    // Compare against the active OTA bundle, not only the APK's built-in version.
    // Otherwise every launch can repeatedly offer the same already-installed bundle.
    const currentInfo = await CapacitorUpdater.current().catch(() => null);
    const builtinVersion = await CapacitorUpdater.getBuiltinVersion().catch(() => null);
    const currentVersion = currentInfo?.bundle?.version || builtinVersion || '1.0.0';
    const response = await withTimeout(
      fetch('https://kandb-management-nexus-api-zv7f.onrender.com/api/app-updates/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          app_id: 'kandbnet.service2010',
          platform: 'android',
          version_name: currentVersion,
        }),
      }),
      UPDATE_CHECK_TIMEOUT_MS,
      'The K&B update server did not respond in time.',
    );
    if (!response.ok) {
      throw new Error('K&B update server returned HTTP ' + response.status + '.');
    }
    const latest = await response.json() as { version?: string; url?: string; checksum?: string; message?: string };
    if (!latest?.url || !latest.version) {
      if (latest?.message === 'No update is available.' || latest?.message === 'No OTA update is currently published.') {
        mountApp(true);
        return;
      }
      throw new Error(latest?.message || 'The update server returned an invalid update response.');
    }

    updateScreen = showUpdateScreen('A new K&B update is available. Preparing download…', () => {
      void runUpdateCheck();
    });
    await CapacitorUpdater.notifyAppReady();
    progressListener = await CapacitorUpdater.addListener('download', state => {
      updateScreen?.setProgress(state.percent);
    });
    const bundle = await withTimeout(
      CapacitorUpdater.download({
        url: latest.url!,
        version: latest.version!,
        ...(latest.checksum ? { checksum: latest.checksum } : {}),
      }),
      UPDATE_DOWNLOAD_TIMEOUT_MS,
      'The update download timed out.',
    );
    await progressListener.remove();
    progressListener = null;
    await CapacitorUpdater.set(bundle);
  } catch (error) {
    console.error('K&B Nexus OTA update failed:', error);
    const message = error instanceof Error ? error.message : 'The update could not be installed.';
    if (updateScreen) {
      updateScreen.showFailure('The update could not be installed. Your current app version is still available. ' + message);
    } else {
      // A temporary check-server/network failure must not lock staff out of the working app.
      mountApp(true);
    }
  } finally {
    if (progressListener) await progressListener.remove().catch(() => undefined);
    updateRunInProgress = false;
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
