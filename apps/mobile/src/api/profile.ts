import { supabase } from '../lib/supabase';
import type { ProfilePatch } from '../lib/profile';

const GENERIC_ERROR = "Couldn't save your profile. Check your connection and try again.";

type Attempt = { ok: true } | { ok: false; error: string; retryable: boolean };

async function attempt(profileId: string, patch: ProfilePatch): Promise<Attempt> {
  try {
    const { data, error } = await supabase!
      .from('profiles')
      .update({ username: patch.username, title: patch.title || null, bio: patch.bio || null })
      .eq('id', profileId)
      .select('id');
    if (error) {
      if (__DEV__) console.warn('[aurafit] profile update failed', error.code, error.message);
      if (error.code === '23514' || error.code === '22001') {
        return { ok: false, error: 'One of the fields is too long or empty.', retryable: false };
      }
      if (error.code === '42501') {
        return { ok: false, error: "You don't have permission to edit this profile.", retryable: false };
      }
      return { ok: false, error: GENERIC_ERROR, retryable: true };
    }
    if (!data || data.length === 0) {
      return { ok: false, error: "Couldn't save your profile. Please sign in again.", retryable: false };
    }
    return { ok: true };
  } catch (err) {
    if (__DEV__) console.warn('[aurafit] profile update threw', err);
    return { ok: false, error: GENERIC_ERROR, retryable: true };
  }
}

/**
 * Updates the signed-in user's own profile (username / title / bio) directly through Supabase.
 * RLS only lets a user update their own row, and clients may only touch these columns. Filter by
 * `id`: `auth_id` is not selectable by clients. Transient failures are retried once.
 */
export async function updateOwnProfile(profileId: string, patch: ProfilePatch): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Profile editing is not available in this build.' };
  let res = await attempt(profileId, patch);
  if (!res.ok && res.retryable) {
    await new Promise((r) => setTimeout(r, 600));
    res = await attempt(profileId, patch);
  }
  return res.ok ? {} : { error: res.error };
}
