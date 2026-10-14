import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import type { Session } from '@supabase/supabase-js';
import { api, isApiError } from '../api';
import { env, isBackendConfigured } from '../config/env';
import { errorMessage } from '../hooks/useApi';
import { runSignOutTasks } from '../lib/signOutTasks';
import { supabase } from '../lib/supabase';
import { AUTH_CALLBACK_PATH, RESET_PASSWORD_PATH, parseAuthRedirect } from './authLinks';
import { friendlyAuthError, normalizeEmail } from './validation';

// Completes a pending auth popup on web; no-op on native.
WebBrowser.maybeCompleteAuthSession();

const DEMO_KEY = 'aurafit:demo-mode:v1';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn' | 'demo';

export interface AuthResult {
  error?: string;
  /** Set on sign-up when email confirmation is required (no session yet). */
  needsConfirmation?: boolean;
}

interface AuthContextValue {
  status: AuthStatus;
  session: Session | null;
  /** False when env vars are missing: the app can only run in demo mode. */
  backendAvailable: boolean;
  googleEnabled: boolean;
  /** True after a password-recovery link was opened; the reset screen must be shown. */
  recoveryPending: boolean;
  /** Error from the last deep link (e.g. expired reset link), for display on the auth screens. */
  linkError: string | null;
  clearLinkError: () => void;
  /** One-off confirmation for the welcome screen (e.g. after the account was deleted). */
  notice: string | null;
  clearNotice: () => void;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  signInWithGoogle: () => Promise<AuthResult>;
  sendPasswordReset: (email: string) => Promise<AuthResult>;
  updatePassword: (password: string) => Promise<AuthResult>;
  cancelRecovery: () => Promise<void>;
  signOut: () => Promise<void>;
  /**
   * Permanently deletes the signed-in account on the server, then signs out on this device.
   * `clearLocalData` runs only after the server confirmed the deletion.
   */
  deleteAccount: (clearLocalData?: () => void) => Promise<AuthResult>;
  enterDemo: () => void;
  exitDemo: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const NOT_CONFIGURED: AuthResult = { error: 'Sign-in is not available in this build (demo mode).' };

/** Redirect targets. Must be listed under Auth → URL Configuration → Redirect URLs (e.g. `aurafit://**`). */
export const resetPasswordRedirect = () => Linking.createURL(RESET_PASSWORD_PATH);
const oauthRedirect = () => Linking.createURL(AUTH_CALLBACK_PATH);
const signupRedirect = () => Linking.createURL(AUTH_CALLBACK_PATH);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(!supabase);
  const [demoChosen, setDemoChosen] = useState<boolean | null>(isBackendConfigured ? null : true);
  const [recoveryPending, setRecoveryPending] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const handledUrls = useRef(new Set<string>());

  // Restore the persisted "Try demo" choice.
  useEffect(() => {
    if (!isBackendConfigured) return;
    AsyncStorage.getItem(DEMO_KEY)
      .then((v) => setDemoChosen(v === '1'))
      .catch(() => setDemoChosen(false));
  }, []);

  // Session bootstrap + subscription.
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) setSession(data.session);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setSessionLoaded(true);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      // Keep this callback synchronous: awaiting supabase calls inside it can deadlock the auth lock.
      setSession(next);
      if (event === 'PASSWORD_RECOVERY') setRecoveryPending(true);
      if (event === 'SIGNED_OUT') setRecoveryPending(false);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Deep links: password recovery + email confirmation (PKCE `?code=` or implicit `#access_token=`).
  const handleUrl = useCallback(async (url: string | null) => {
    if (!supabase || !url || handledUrls.current.has(url)) return;
    const parsed = parseAuthRedirect(url);
    if (!parsed) return;
    handledUrls.current.add(url);

    if (parsed.kind === 'error') {
      setLinkError(
        parsed.code === 'otp_expired' ? 'That link has expired. Request a new one.' : parsed.message
      );
      return;
    }
    try {
      if (parsed.kind === 'code') {
        const { error } = await supabase.auth.exchangeCodeForSession(
          parsed.code,
          parsed.flowId ? { flowId: parsed.flowId } : undefined
        );
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.setSession({
          access_token: parsed.accessToken,
          refresh_token: parsed.refreshToken,
        });
        if (error) throw error;
      }
      if (parsed.isRecovery) setRecoveryPending(true);
      setLinkError(null);
    } catch (err) {
      setLinkError(
        parsed.isRecovery
          ? 'This reset link is invalid or was opened on a different device. Request a new one from this device.'
          : friendlyAuthError(err as { message?: string })
      );
    }
  }, []);

  useEffect(() => {
    if (!supabase) return;
    Linking.getInitialURL()
      .then((url) => handleUrl(url))
      .catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => {
      void handleUrl(url);
    });
    return () => sub.remove();
  }, [handleUrl]);

  const setDemo = useCallback((on: boolean) => {
    setDemoChosen(on);
    if (!isBackendConfigured) return;
    (on ? AsyncStorage.setItem(DEMO_KEY, '1') : AsyncStorage.removeItem(DEMO_KEY)).catch(() => {});
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    if (!supabase) return NOT_CONFIGURED;
    const { error } = await supabase.auth.signInWithPassword({ email: normalizeEmail(email), password });
    if (error) return { error: friendlyAuthError(error) };
    setDemo(false);
    return {};
  }, [setDemo]);

  const signUp = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    if (!supabase) return NOT_CONFIGURED;
    const { data, error } = await supabase.auth.signUp({
      email: normalizeEmail(email),
      password,
      options: { emailRedirectTo: signupRedirect() },
    });
    if (error) return { error: friendlyAuthError(error) };
    setDemo(false);
    return { needsConfirmation: !data.session };
  }, [setDemo]);

  const signInWithGoogle = useCallback(async (): Promise<AuthResult> => {
    if (!supabase) return NOT_CONFIGURED;
    const redirectTo = oauthRedirect();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error || !data?.url) return { error: friendlyAuthError(error) };

    const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (res.type !== 'success') return {}; // user cancelled / dismissed
    const parsed = parseAuthRedirect(res.url);
    if (!parsed) return { error: 'Google sign-in did not complete. Please try again.' };
    if (parsed.kind === 'error') return { error: parsed.message };
    handledUrls.current.add(res.url);
    const result =
      parsed.kind === 'code'
        ? await supabase.auth.exchangeCodeForSession(parsed.code, parsed.flowId ? { flowId: parsed.flowId } : undefined)
        : await supabase.auth.setSession({ access_token: parsed.accessToken, refresh_token: parsed.refreshToken });
    if (result.error) return { error: friendlyAuthError(result.error) };
    setDemo(false);
    return {};
  }, [setDemo]);

  const sendPasswordReset = useCallback(async (email: string): Promise<AuthResult> => {
    if (!supabase) return NOT_CONFIGURED;
    const { error } = await supabase.auth.resetPasswordForEmail(normalizeEmail(email), {
      redirectTo: resetPasswordRedirect(),
    });
    // Rate-limit errors are worth surfacing; anything else is reported as success so the screen
    // never reveals whether an account exists for the address.
    if (error && (error.status === 429 || error.code?.startsWith('over_'))) {
      return { error: friendlyAuthError(error) };
    }
    return {};
  }, []);

  const updatePassword = useCallback(async (password: string): Promise<AuthResult> => {
    if (!supabase) return NOT_CONFIGURED;
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { error: friendlyAuthError(error) };
    setRecoveryPending(false);
    setDemo(false);
    return {};
  }, [setDemo]);

  const signOut = useCallback(async () => {
    setRecoveryPending(false);
    if (!supabase) return;
    // While the session is still valid: e.g. remove this device's push token (bounded, never blocks).
    await runSignOutTasks();
    // Revokes the refresh token server-side; local session is cleared even if the network call fails.
    const { error } = await supabase.auth.signOut();
    if (error) await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  }, []);

  const deleteAccount = useCallback(
    async (clearLocalData?: () => void): Promise<AuthResult> => {
      if (!supabase || !api) return NOT_CONFIGURED;
      try {
        await api.deleteMe();
      } catch (err) {
        if (isApiError(err) && err.status === 401) {
          // The client already dropped the dead session; explain why the user is back on Welcome.
          setLinkError('Your session expired, so your account was not deleted. Log in again to delete it.');
        }
        return { error: errorMessage(err) };
      }
      clearLocalData?.();
      setRecoveryPending(false);
      setDemo(false);
      setNotice('Your AuraFit account and its data have been permanently deleted.');
      // The server already revoked everything; only the local session needs clearing.
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      return {};
    },
    [setDemo]
  );

  const cancelRecovery = useCallback(async () => {
    // The recovery session should not silently become a normal login.
    await signOut();
  }, [signOut]);

  const enterDemo = useCallback(() => setDemo(true), [setDemo]);
  const exitDemo = useCallback(() => {
    if (isBackendConfigured) setDemo(false);
  }, [setDemo]);
  const clearLinkError = useCallback(() => setLinkError(null), []);
  const clearNotice = useCallback(() => setNotice(null), []);

  const status: AuthStatus =
    !sessionLoaded || demoChosen === null
      ? 'loading'
      : session
        ? 'signedIn'
        : demoChosen
          ? 'demo'
          : 'signedOut';

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      backendAvailable: isBackendConfigured,
      googleEnabled: env.mode === 'backend' && env.enableGoogleAuth,
      recoveryPending,
      linkError,
      clearLinkError,
      notice,
      clearNotice,
      signIn,
      signUp,
      signInWithGoogle,
      sendPasswordReset,
      updatePassword,
      cancelRecovery,
      signOut,
      deleteAccount,
      enterDemo,
      exitDemo,
    }),
    [
      status,
      session,
      recoveryPending,
      linkError,
      clearLinkError,
      notice,
      clearNotice,
      signIn,
      signUp,
      signInWithGoogle,
      sendPasswordReset,
      updatePassword,
      cancelRecovery,
      signOut,
      deleteAccount,
      enterDemo,
      exitDemo,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
