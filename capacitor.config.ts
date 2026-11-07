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
      version: '1.0.0',
      autoUpdate: 'off',
      updateUrl: 'https://kandb-management-nexus-api-zv7f.onrender.com/api/app-updates/check',
      statsUrl: '',
      httpsOnly: true,
      appReadyTimeout: 30000,
    },
  },
};

export default config;
