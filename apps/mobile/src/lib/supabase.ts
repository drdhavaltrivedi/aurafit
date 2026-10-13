// Must be imported before anything that calls crypto.getRandomValues (aes-js key generation, PKCE).
import 'react-native-get-random-values';
// Must run before supabase-js generates a PKCE challenge.
import './cryptoPolyfill';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as aesjs from 'aes-js';
import { createClient, processLock, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env';

/**
 * Session storage following Supabase's documented Expo pattern
 * (https://supabase.com/docs/guides/getting-started/tutorials/with-expo-react-native — "SecureStore"):
 * SecureStore values are limited to 2048 bytes and a Supabase session is larger, so a fresh
 * AES-256 key is generated per write and kept in SecureStore (Keychain / Android Keystore) while
 * the AES-CTR-encrypted session blob lives in AsyncStorage.
 *
 * Deviations from the doc sample (hardening only):
 *  - keychain items are `WHEN_UNLOCKED_THIS_DEVICE_ONLY` (not synced to backups / other devices;
 *    a restored backup simply requires signing in again),
 *  - a corrupt / undecryptable entry is cleared and treated as "no session" instead of throwing,
 *  - SecureStore keys are sanitised to its allowed charset.
 */
const SECURE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const secureKey = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, '_');

class LargeSecureStore {
  private async encrypt(key: string, value: string): Promise<string> {
    const encryptionKey = crypto.getRandomValues(new Uint8Array(256 / 8));
    const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(1));
    const encryptedBytes = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
    await SecureStore.setItemAsync(secureKey(key), aesjs.utils.hex.fromBytes(encryptionKey), SECURE_OPTIONS);
    return aesjs.utils.hex.fromBytes(encryptedBytes);
  }

  private async decrypt(key: string, value: string): Promise<string | null> {
    const encryptionKeyHex = await SecureStore.getItemAsync(secureKey(key), SECURE_OPTIONS);
    if (!encryptionKeyHex) return null;
    const cipher = new aesjs.ModeOfOperation.ctr(aesjs.utils.hex.toBytes(encryptionKeyHex), new aesjs.Counter(1));
    const decryptedBytes = cipher.decrypt(aesjs.utils.hex.toBytes(value));
    return aesjs.utils.utf8.fromBytes(decryptedBytes);
  }

  async getItem(key: string): Promise<string | null> {
    const encrypted = await AsyncStorage.getItem(key);
    if (!encrypted) return null;
    try {
      return await this.decrypt(key, encrypted);
    } catch {
      await this.removeItem(key).catch(() => {});
      return null;
    }
  }

  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(secureKey(key), SECURE_OPTIONS);
  }

  async setItem(key: string, value: string): Promise<void> {
    const encrypted = await this.encrypt(key, value);
    await AsyncStorage.setItem(key, encrypted);
  }
}

function createSupabase(): SupabaseClient | null {
  if (env.mode !== 'backend') return null;
  try {
    return createClient(env.supabaseUrl, env.supabaseKey, {
      auth: {
        // expo-secure-store has no web implementation; web falls back to AsyncStorage (localStorage).
        storage: Platform.OS === 'web' ? AsyncStorage : new LargeSecureStore(),
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        // PKCE: email links / OAuth redirect back with `?code=` which we exchange on-device.
        flowType: 'pkce',
        // In-process lock: there is no Web Locks API in React Native.
        lock: processLock,
      },
    });
  } catch (err) {
    if (__DEV__) console.warn('[aurafit] failed to create Supabase client; falling back to demo mode', err);
    return null;
  }
}

/** `null` when the backend env is not configured (demo mode). */
export const supabase: SupabaseClient | null = createSupabase();

// Only refresh tokens while the app is in the foreground (supabase-js docs: startAutoRefresh).
// Registered once at module load.
if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
