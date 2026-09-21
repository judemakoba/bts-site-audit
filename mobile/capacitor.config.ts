import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.telco.assetcapture',
  appName: 'Asset Capture',
  webDir: 'dist',
  server: {
    // Production server
    url: 'http://41.84.202.39:3001',
    androidScheme: 'http',
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
