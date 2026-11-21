/**
 * ============================================================================
 * ALSTORE — KONFIGURASI FIREBASE AUTHENTICATION (GOOGLE & APPLE) + FIRESTORE
 * ============================================================================
 *
 * File ini secara default sudah terhubung otomatis dengan project Firebase
 * yang diprovisikan di `firebase-applet-config.json` (Google Sign-In & Firestore
 * langsung aktif).
 *
 * Jika Anda ingin memindahkan ALSTORE ke project Firebase milik Anda sendiri:
 * 1. Buka Firebase Console (https://console.firebase.google.com) -> Project Settings.
 * 2. Ganti nilai di objek `CUSTOM_FIREBASE_CONFIG` di bawah ini dengan:
 *    - apiKey       : Web API Key dari Firebase Console
 *    - authDomain   : <project-id>.firebaseapp.com
 *    - projectId    : ID Project Firebase Anda
 *    - storageBucket, messagingSenderId, appId
 *
 * 3. Untuk mengaktifkan "Continue with Apple" (OAuthProvider('apple.com')):
 *    - Masuk ke Apple Developer Portal -> Certificates, Identifiers & Profiles.
 *    - Buat App ID & Services ID (misal: `com.alstore.web.auth`).
 *    - Tambahkan Return URL dari Firebase: `https://<authDomain>/__/auth/handler`.
 *    - Buat Key (Sign in with Apple) dan catat Key ID + Team ID + Private Key (.p8).
 *    - Di Firebase Console -> Authentication -> Sign-in method -> Apple -> Enable,
 *      lalu masukkan Services ID, Team ID, Key ID, dan Private Key tersebut.
 *    - Isi `APPLE_AUTH_CONFIG.serviceId` di bawah jika Anda ingin mencatat referensi Service ID.
 */

import provisionedConfig from '../firebase-applet-config.json';

// Kosongkan field di bawah untuk memakai konfigurasi otomatis dari firebase-applet-config.json,
// atau isi dengan kredensial Firebase project Anda sendiri.
const CUSTOM_FIREBASE_CONFIG = {
  apiKey: '', // <-- Masukkan Firebase apiKey Anda di sini (opsional override)
  authDomain: '', // <-- Masukkan authDomain (contoh: alstore-app.firebaseapp.com)
  projectId: '', // <-- Masukkan projectId (contoh: alstore-app)
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
  firestoreDatabaseId: ''
};

export const firebaseConfig = {
  apiKey: CUSTOM_FIREBASE_CONFIG.apiKey || provisionedConfig.apiKey,
  authDomain: CUSTOM_FIREBASE_CONFIG.authDomain || provisionedConfig.authDomain,
  projectId: CUSTOM_FIREBASE_CONFIG.projectId || provisionedConfig.projectId,
  storageBucket: CUSTOM_FIREBASE_CONFIG.storageBucket || provisionedConfig.storageBucket,
  messagingSenderId: CUSTOM_FIREBASE_CONFIG.messagingSenderId || provisionedConfig.messagingSenderId,
  appId: CUSTOM_FIREBASE_CONFIG.appId || provisionedConfig.appId,
  firestoreDatabaseId:
    CUSTOM_FIREBASE_CONFIG.firestoreDatabaseId || provisionedConfig.firestoreDatabaseId
};

export const APPLE_AUTH_CONFIG = {
  // Masukkan Apple Services ID Anda setelah diaktifkan di Firebase Console -> Auth -> Apple
  serviceId: 'com.alstore.web.signin',
  scopes: ['email', 'name'],
  locale: 'id'
};
