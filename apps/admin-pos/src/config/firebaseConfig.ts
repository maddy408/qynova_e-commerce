/**
 * Firebase config object — reads every key from src/config/env.ts only
 * (never import.meta.env directly). No Firebase SDK calls or business
 * logic belong in this file; see src/services/firebase/ for that.
 */
import { env } from './env'

export const firebaseConfig = {
  apiKey: env.FIREBASE_API_KEY || 'AIzaSyDnJ2zTCmofnMzR_8jgs52X26cq49Lneok',
  authDomain: env.FIREBASE_AUTH_DOMAIN || 'shop-with-adams.firebaseapp.com',
  projectId: env.FIREBASE_PROJECT_ID || 'shop-with-adams',
  storageBucket: env.FIREBASE_STORAGE_BUCKET || 'shop-with-adams.firebasestorage.app',
  messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID || '1071658443475',
  appId: env.FIREBASE_APP_ID || '1:1071658443475:web:34653cb3bb94148bd8aa26',
  measurementId: env.FIREBASE_MEASUREMENT_ID || 'G-EFZMT874H9',
}

export const FIREBASE_VAPID_KEY = env.FIREBASE_VAPID_KEY
