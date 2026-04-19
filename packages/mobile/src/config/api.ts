import { Platform } from 'react-native';

// In development, use the machine's local IP (not localhost — that means the device itself on Android)
// In production, use the deployed backend
const DEV_API_URL = Platform.select({
  android: 'http://10.0.2.2:3001/api',   // Android emulator → host machine
  ios: 'http://localhost:3001/api',        // iOS simulator
  default: 'http://localhost:3001/api',
});

export const API_BASE_URL = __DEV__ ? DEV_API_URL : 'https://theomnilink.io/api';
export const SOCKET_URL = __DEV__
  ? Platform.select({ android: 'http://10.0.2.2:3001', ios: 'http://localhost:3001', default: 'http://localhost:3001' })!
  : 'https://theomnilink.io';

export const REQUEST_TIMEOUT = 30000;
export const UPLOAD_TIMEOUT = 120000;
