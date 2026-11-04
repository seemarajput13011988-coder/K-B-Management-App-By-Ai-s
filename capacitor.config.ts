import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'in.kandbnetservice.management',
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
  },
};

export default config;
