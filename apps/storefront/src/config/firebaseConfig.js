/**
 * Firebase config object — reads every key from src/config/env.js only
 * (never import.meta.env directly). No Firebase SDK calls or business
 * logic belong in this file; see src/services/firebase/ for that.
 */
import { env } from './env'

export const firebaseConfig = {
  apiKey: env.FIREBASE_API_KEY,
  authDomain: env.FIREBASE_AUTH_DOMAIN,
  projectId: env.FIREBASE_PROJECT_ID,
  storageBucket: env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID,
  appId: env.FIREBASE_APP_ID,
}

export const FIREBASE_VAPID_KEY = env.FIREBASE_VAPID_KEY
