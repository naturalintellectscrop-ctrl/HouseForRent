/**
 * The client-side transport - the ONLY module a client component needs for
 * mutations.
 *
 * Every state change goes over real HTTP to /api/v1 route handlers, so the
 * journey the browser takes is the journey the product ships. The handlers
 * re-authorise every call server-side (role, ownership, state machine);
 * nothing here holds privilege, it carries intent and renders the answer.
 */
'use client';

export class ClientApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ClientApiError';
  }
}

async function parse(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text };
  }
}

/** POST/PUT/DELETE JSON to /api/v1, with the API's error shape. */
export async function postJson<T = Record<string, unknown>>(
  path: string,
  body?: unknown,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'POST',
): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const parsed = await parse(res);
  if (!res.ok) {
    const err = parsed.error as { code?: string; message?: string } | undefined;
    throw new ClientApiError(res.status, err?.code ?? 'UNKNOWN', err?.message ?? `request failed (${res.status})`);
  }
  return parsed as T;
}

/** Uploads a file as multipart/form-data (photography upload). */
export async function postFile<T = Record<string, unknown>>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`/api/v1${path}`, { method: 'POST', body: form });
  const parsed = await parse(res);
  if (!res.ok) {
    const err = parsed.error as { code?: string; message?: string } | undefined;
    throw new ClientApiError(res.status, err?.code ?? 'UNKNOWN', err?.message ?? `upload failed (${res.status})`);
  }
  return parsed as T;
}
