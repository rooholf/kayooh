/**
 * Data plumbing for the admin console (`(admin)` route group).
 *
 * Every non-2xx response is the SRS §3.2 envelope
 * `{ error: { code, message, details?, requestId } }`; this module turns it
 * into one `ApiError` the panels map to honest Indonesian copy.
 *
 * Two pipes:
 *  - public catalog (`GET /api/v1/outlets`) is read straight from the API
 *    base — it needs no credentials (availability counts only, NEG-2);
 *  - everything under `/api/v1/admin/**` goes through the same-origin pipe
 *    `app/api/admin/[[...path]]` so the HttpOnly admin session cookie
 *    travels server-side (NFR-04). A 401 there means "not signed in".
 */
export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

const ADMIN_PROXY = "/api/admin";

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, code: string | undefined, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/** Read the canonical error envelope out of a failed response. */
export async function readApiError(res: Response, fallback: string): Promise<ApiError> {
  const payload = (await res.json().catch(() => null)) as
    | { error?: { code?: string; message?: string } }
    | null;
  return new ApiError(
    res.status,
    payload?.error?.code,
    payload?.error?.message ?? `${fallback} (HTTP ${res.status}).`,
  );
}

/** A network-level failure with no HTTP status (offline, DNS, refused). */
export function networkError(): ApiError {
  return new ApiError(0, undefined, "Tidak bisa menghubungi server.");
}

/* ----------------------------- admin session ----------------------------- */

/** Email + password credential sign-in through the auth pipe. */
export async function signInAdmin(email: string, password: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    throw networkError();
  }
  if (!res.ok) {
    throw await readApiError(res, "Email atau kata sandi salah.");
  }
  await res.json().catch(() => null);
}

/** End the admin session (the API answers with a clearing Set-Cookie). */
export async function signOutAdmin(): Promise<void> {
  try {
    await fetch("/api/auth/sign-out", { method: "POST" });
  } catch {
    // Session is dead either way; the next admin call reports the truth.
  }
}

/* ------------------------------ admin pipe ------------------------------- */

async function adminFetch(path: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${ADMIN_PROXY}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...init?.headers },
    });
  } catch {
    throw networkError();
  }
  return res;
}

/** GET through the admin pipe; throws ApiError (401 = belum masuk). */
export async function adminGet<T>(path: string, fallback: string): Promise<T> {
  const res = await adminFetch(path);
  if (!res.ok) throw await readApiError(res, fallback);
  return (await res.json()) as T;
}

/** POST/PATCH through the admin pipe. */
export async function adminSend<T>(
  method: "POST" | "PATCH",
  path: string,
  body: unknown,
  fallback: string,
): Promise<T> {
  const res = await adminFetch(path, {
    method,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await readApiError(res, fallback);
  return (await res.json()) as T;
}

/* ------------------------------ public reads ----------------------------- */

export interface OutletListItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  address: string;
  lat: number;
  lng: number;
  hours: unknown;
  isOpenNow: boolean;
  /** Availability per category code; zero-bike categories are omitted. */
  availability: Record<string, number>;
}

/** GET /api/v1/outlets — public catalog with availability counts. */
export async function fetchOutlets(): Promise<OutletListItem[]> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/v1/outlets`, { cache: "no-store" });
  } catch {
    throw networkError();
  }
  if (!res.ok) throw await readApiError(res, "Gagal memuat daftar outlet");
  const payload = (await res.json()) as { outlets: OutletListItem[] };
  return payload.outlets;
}
