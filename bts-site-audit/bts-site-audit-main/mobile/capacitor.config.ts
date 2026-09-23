import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.telco.assetcapture',
  appName: 'Asset Capture',
  webDir: 'dist',
  server: {
    // Change this to your server IP when testing on device
    // e.g. 'http://192.168.1.100:3000'
    // For local development on emulator, use:
    // Android Emulator: 'http://10.0.2.2:3000'
    // iOS Simulator: 'http://localhost:3000'
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
