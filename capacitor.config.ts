import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'kandbnet.service2010',
  appName: 'K&B Management Nexus',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
    useLegacyBridge: true,
  },
  // The native background-location callback uses CapacitorHttp for network uploads.
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    CapacitorUpdater: {
      appId: 'kandbnet.service2010',
      autoUpdate: 'background',
      updateUrl: 'https://kandb-management-nexus-api-zv7f.onrender.com/api/app-updates/check',
      statsUrl: '',
      appReadyTimeout: 15000,
      resetWhenUpdate: true,
      autoSplashscreen: false,
    },
    SplashScreen: {
      launchAutoHide: true,
    },
  },
};

export default config;
