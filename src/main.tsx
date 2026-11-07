import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import App from './App';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Nexus root element is missing.');
const appRoot: HTMLElement = rootElement;

function loadBrandFonts() {
  if (document.querySelector('link[data-nexus-brand-fonts]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap';
  link.dataset.nexusBrandFonts = 'true';
  document.head.append(link);
}

function mountApp() {
  createRoot(appRoot).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

function showUpdateRequired(message: string, retry: () => void) {
  appRoot.innerHTML = '';
  const screen = document.createElement('main');
  screen.setAttribute('role', 'status');
  screen.style.cssText = 'min-height:100dvh;display:grid;place-content:center;justify-items:center;gap:14px;padding:28px;background:#f4f7fb;color:#17243a;font-family:system-ui,sans-serif;text-align:center';
  const mark = document.createElement('div');
  mark.textContent = 'K&B';
  mark.style.cssText = 'font-size:24px;font-weight:800;letter-spacing:.04em;color:#2563eb';
  const title = document.createElement('h1');
  title.textContent = 'Updating K&B Nexus';
  title.style.cssText = 'font-size:21px;margin:0';
  const detail = document.createElement('p');
  detail.textContent = message;
  detail.style.cssText = 'max-width:320px;margin:0;color:#64748b;line-height:1.55;font-size:14px';
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Retry update';
  button.style.cssText = 'border:0;border-radius:10px;background:#1d4ed8;color:white;padding:12px 22px;font-weight:700;font-size:14px';
  button.addEventListener('click', () => {
    button.disabled = true;
    button.textContent = 'Checking…';
    retry();
  });
  screen.append(mark, title, detail, button);
  appRoot.append(screen);
}

async function runRequiredUpdate(updateWasPreviouslyRequired = false): Promise<void> {
  let updateWasAdvertised = updateWasPreviouslyRequired;
  try {
    const latest = await CapacitorUpdater.getLatest();
    if (!latest?.url || !latest.version) {
      mountApp();
      return;
    }
    updateWasAdvertised = true;
    showUpdateRequired('A required update is available. Please keep the app open while it downloads and installs.', () => {
      void runRequiredUpdate(true);
    });
    const bundle = await CapacitorUpdater.download({
      url: latest.url,
      version: latest.version,
      ...(latest.checksum ? { checksum: latest.checksum } : {}),
    });
    await CapacitorUpdater.set(bundle);
    // set() reloads the WebView. Do not mount the old app after this point.
  } catch (error) {
    console.error('Nexus OTA update check/install failed:', error);
    if (updateWasAdvertised) {
      showUpdateRequired('The update could not be installed. Check your internet connection and retry. The previous app version is kept safely.', () => {
        void runRequiredUpdate(true);
      });
      return;
    }
    // If the update server itself is temporarily unreachable, preserve access to
    // the last known-good app rather than locking staff out without evidence of an update.
    mountApp();
  }
}

async function bootstrap() {
  if (!Capacitor.isNativePlatform()) {
    loadBrandFonts();
    mountApp();
    return;
  }
  try {
    // This must run before network requests so the updater can retain/roll back
    // the currently loaded bundle if a later bundle fails to start.
    await CapacitorUpdater.notifyAppReady();
  } catch (error) {
    console.error('Nexus updater readiness notification failed:', error);
  }
  loadBrandFonts();
  await runRequiredUpdate();
}

void bootstrap();
