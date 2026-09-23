import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.telco.assetcapture',
  appName: 'Asset Capture',
  webDir: 'dist',
  server: {
    // Production server — Tailscale Funnel public URL (HTTPS, no Tailscale client needed)
    // LXC 203 (bts-audit) publishes directly with its own Funnel URL
    url: 'https://bts-audit-1.tailfd1512.ts.net',
    androidScheme: 'https',
  },
  plugins: {
    Camera: {
      promptLabelPhoto: 'Take Asset Photo',
      promptLabelPicture: 'Choose from Gallery',
    },
    StatusBar: {
      backgroundColor: '#1F4E79',
      style: 'DARK',
    },
  },
};

export default config;
