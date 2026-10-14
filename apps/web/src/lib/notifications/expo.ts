/**
 * Minimal Expo Push API client (https://docs.expo.dev/push-notifications/sending-notifications/).
 * Never throws: transport problems come back as `{ ok: false }`.
 */
export const EXPO_PUSH_SEND_URL = 'https://exp.host/--/api/v2/push/send';
export const EXPO_PUSH_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
/** Expo accepts at most 100 messages per send request... */
export const EXPO_SEND_BATCH = 100;
/** ...and at most 1000 ticket ids per receipts request. */
export const EXPO_RECEIPTS_BATCH = 1000;
const TIMEOUT_MS = 15_000;

export interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  channelId?: string;
  priority?: 'default' | 'normal' | 'high';
}

export interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string; expoPushToken?: string };
}

export type ExpoReceipt = Omit<ExpoTicket, 'id'>;

export type ExpoResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

interface ExpoClientOptions {
  accessToken?: string;
  fetchImpl?: typeof fetch;
}

async function post<T>(url: string, body: unknown, { accessToken, fetchImpl = fetch }: ExpoClientOptions): Promise<ExpoResult<T>> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Accept-Encoding': 'gzip, deflate',
    'Content-Type': 'application/json',
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  let res: Response;
  try {
    res = await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : 'network error' };
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  const obj = (json && typeof json === 'object' ? json : {}) as { data?: unknown; errors?: { message?: string }[] };
  if (!res.ok || obj.data === undefined) {
    return { ok: false, status: res.status, error: obj.errors?.[0]?.message ?? `Expo responded ${res.status}` };
  }
  return { ok: true, data: obj.data as T };
}

/** Sends up to 100 messages; tickets are returned in message order. */
export async function sendExpoBatch(messages: readonly ExpoMessage[], opts: ExpoClientOptions = {}): Promise<ExpoResult<ExpoTicket[]>> {
  if (messages.length > EXPO_SEND_BATCH) throw new RangeError(`at most ${EXPO_SEND_BATCH} messages per request`);
  const res = await post<unknown>(EXPO_PUSH_SEND_URL, messages, opts);
  if (!res.ok) return res;
  if (!Array.isArray(res.data)) return { ok: false, status: 200, error: 'unexpected Expo response' };
  // A short array would misattribute tickets; treat missing entries as errors.
  const tickets = messages.map((_, i): ExpoTicket => {
    const t = (res.data as unknown[])[i] as ExpoTicket | undefined;
    return t && (t.status === 'ok' || t.status === 'error') ? t : { status: 'error', message: 'missing ticket' };
  });
  return { ok: true, data: tickets };
}

/** Receipts keyed by ticket id (ids without a receipt yet are simply absent). */
export async function getExpoReceipts(ids: readonly string[], opts: ExpoClientOptions = {}): Promise<ExpoResult<Record<string, ExpoReceipt>>> {
  if (ids.length > EXPO_RECEIPTS_BATCH) throw new RangeError(`at most ${EXPO_RECEIPTS_BATCH} ids per request`);
  const res = await post<unknown>(EXPO_PUSH_RECEIPTS_URL, { ids }, opts);
  if (!res.ok) return res;
  if (!res.data || typeof res.data !== 'object' || Array.isArray(res.data)) return { ok: false, status: 200, error: 'unexpected Expo response' };
  return { ok: true, data: res.data as Record<string, ExpoReceipt> };
}

export const isDeviceNotRegistered = (t: { status: string; details?: { error?: string } } | undefined) =>
  t?.status === 'error' && t.details?.error === 'DeviceNotRegistered';
