import { env } from '../config/env';
import { supabase } from '../lib/supabase';
import { createApiClient, type ApiClient } from './client';

export { ApiError, isApiError } from './client';
export type { ApiClient } from './client';

/** `null` in demo mode. */
export const api: ApiClient | null =
  env.mode === 'backend' && supabase
    ? createApiClient({
        baseUrl: env.apiUrl,
        getAccessToken: async () => {
          // getSession() reads local storage and refreshes an expired token if needed. The server
          // must still verify the JWT — never trust it client-side for authorization.
          const { data } = await supabase!.auth.getSession();
          return data.session?.access_token ?? null;
        },
        refreshAccessToken: async () => {
          const { data, error } = await supabase!.auth.refreshSession();
          if (error) return null;
          return data.session?.access_token ?? null;
        },
        onUnauthorized: () => {
          // The session is no longer accepted by the server even after a refresh: drop it locally so
          // the user lands back on the welcome screen instead of a broken signed-in UI.
          supabase!.auth.signOut({ scope: 'local' }).catch(() => {});
        },
      })
    : null;
