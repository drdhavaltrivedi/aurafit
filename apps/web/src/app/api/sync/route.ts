import {
  MAX_SYNC_BODY_BYTES,
  validateSyncPayload,
  type SyncErrorResponse,
  type SyncResponse,
} from '@aurafit/shared';

export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

function errorResponse(status: number, error: string, details?: string[]): Response {
  const body: SyncErrorResponse = { success: false, error };
  if (details && details.length > 0) body.details = details;
  return Response.json(body, { status, headers: NO_STORE_HEADERS });
}

class PayloadTooLargeError extends Error {}

/** Reads the request body as text, aborting once it exceeds `limit` bytes. */
async function readBodyWithLimit(request: Request, limit: number): Promise<string> {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => undefined);
      throw new PayloadTooLargeError();
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(merged);
}

/**
 * Accepts a client progress sync (aura / stat gains for a quest or workout).
 *
 * No database is wired up yet, so the payload is validated and acknowledged with
 * `status: 'PENDING_VALIDATION'` and `persisted: false`. Nothing here claims the
 * gain was verified by anti-cheat or written to a ledger.
 */
export async function POST(request: Request): Promise<Response> {
  const contentType = request.headers.get('content-type') ?? '';
  const mediaType = contentType.split(';')[0].trim().toLowerCase();
  if (mediaType !== 'application/json') {
    return errorResponse(415, 'Content-Type must be application/json');
  }

  const declaredLength = request.headers.get('content-length');
  if (declaredLength !== null) {
    const length = Number(declaredLength);
    if (Number.isFinite(length) && length > MAX_SYNC_BODY_BYTES) {
      return errorResponse(413, `Request body exceeds ${MAX_SYNC_BODY_BYTES} bytes`);
    }
  }

  let raw: string;
  try {
    raw = await readBodyWithLimit(request, MAX_SYNC_BODY_BYTES);
  } catch (err) {
    if (err instanceof PayloadTooLargeError) {
      return errorResponse(413, `Request body exceeds ${MAX_SYNC_BODY_BYTES} bytes`);
    }
    return errorResponse(400, 'Unable to read request body');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return errorResponse(400, 'Malformed JSON body');
  }

  const result = validateSyncPayload(parsed);
  if (!result.ok) {
    return errorResponse(400, 'Invalid sync payload', result.errors);
  }

  const body: SyncResponse = {
    success: true,
    status: 'PENDING_VALIDATION',
    persisted: false,
    receipt: crypto.randomUUID(),
    receivedAt: new Date().toISOString(),
    accepted: result.value,
  };
  return Response.json(body, { status: 202, headers: NO_STORE_HEADERS });
}
