import type { ApiError, ApiErrorCode } from '@aurafit/shared';

export const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export function json<T>(body: T, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...NO_STORE_HEADERS, ...headers } });
}

export function apiError(
  status: number,
  code: ApiErrorCode,
  error: string,
  extra: Partial<Pick<ApiError, 'details' | 'fieldErrors'>> & { headers?: Record<string, string> } = {},
): Response {
  const { headers, ...rest } = extra;
  const body: ApiError = { error, code, ...rest };
  return json(body, status, headers);
}

export const notConfigured = () =>
  apiError(503, 'NOT_CONFIGURED', 'Accounts are not configured on this server. Use demo mode instead.');

export const internalError = () => apiError(500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.');

/** Identifiers in paths: same rule as the DB CHECK (letters, digits, _ and -; 1-100 chars). */
export function isValidId(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && id.length <= 100 && /^[A-Za-z0-9_-]+$/.test(id);
}

export class BodyError extends Error {
  constructor(readonly response: Response) {
    super('invalid body');
  }
}

/** Reads and parses a JSON body (Content-Type checked, size-limited). Throws BodyError. */
export async function readJson(request: Request, limitBytes: number): Promise<unknown> {
  const mediaType = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (mediaType !== 'application/json') {
    throw new BodyError(apiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json'));
  }
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limitBytes) {
    throw new BodyError(apiError(413, 'PAYLOAD_TOO_LARGE', `Request body exceeds ${limitBytes} bytes`));
  }
  let total = 0;
  const chunks: Uint8Array[] = [];
  if (request.body) {
    const reader = request.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limitBytes) {
        await reader.cancel().catch(() => undefined);
        throw new BodyError(apiError(413, 'PAYLOAD_TOO_LARGE', `Request body exceeds ${limitBytes} bytes`));
      }
      chunks.push(value);
    }
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(merged));
  } catch {
    throw new BodyError(apiError(400, 'BAD_REQUEST', 'Malformed JSON body'));
  }
}
