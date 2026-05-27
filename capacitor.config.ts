import type { CapacitorConfig } from '@capacitor/cli';

const liveUrl =
  process.env.CAPACITOR_LIVE_URL ||
  process.env.APP_URL ||
  'https://ticket-management-system-th5i.onrender.com';

const config: CapacitorConfig = {
  appId: 'com.aaradhya.tickets',
  appName: 'Aaradhya Group Tickets',
  webDir: 'dist',
  server: liveUrl
    ? {
        url: liveUrl,
        cleartext: liveUrl.startsWith('http://')
      }
    : undefined
};

export default config;
