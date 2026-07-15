import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-storage.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const isFileProtocol = typeof window !== 'undefined' && window.location.protocol === 'file:';
const firebaseConfigured = !isFileProtocol && Object.values(firebaseConfig).every(Boolean);
export const app = firebaseConfigured ? initializeApp(firebaseConfig) : null;

export const db = app
  ? initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
  })
  : null;

export const storage = app ? getStorage(app) : null;

export const auth = app ? getAuth(app) : null;
