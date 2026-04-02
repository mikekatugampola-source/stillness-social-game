import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.dontouch',
  appName: 'Don\'t Touch',
  webDir: 'dist',
  server: {
    url: 'https://082fdc24-e2ea-4c42-9534-3b02e2b8da47.lovableproject.com?forceHideBadge=true',
    cleartext: true
  }
};

export default config;
