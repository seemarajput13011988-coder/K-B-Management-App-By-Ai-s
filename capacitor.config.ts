import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'in.kandbnetservice.management',
  appName: 'K&B Customer Management',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
};

export default config;
