import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'in.kandbnetservice.management',
  appName: 'K&B Management Nexus',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
};

export default config;
