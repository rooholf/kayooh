/**
 * Shared fetch plumbing for the reservation surface.
 *
 * Every non-2xx response is the SRS §3.2 envelope
 * `{ error: { code, message, details?, requestId } }`; this module turns it
 * into one `ApiError` the components can map to honest Indonesian copy.
 */
export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

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

/** A network-level failure with no HTTP status (offline, CORS, DNS). */
export function networkError(): ApiError {
  return new ApiError(0, undefined, "Tidak bisa menghubungi server.");
}
