"use client";

/**
 * #20 FR-ID-01 auth hooks for /masuk.
 *
 *   POST /api/auth/phone-number/send-otp  { phoneNumber }
 *   POST /api/auth/phone-number/verify    { phoneNumber, code }
 *   GET  /api/renters/me                  → { phone } (renter session only)
 *
 * All three go through the same-origin pipes (`app/api/auth/[[...path]]` and
 * `app/api/renters/[[...path]]`) that forward cookies and return `Set-Cookie`,
 * so the browser never reads the HttpOnly session cookie itself (NFR-04).
 * Failed calls still answer in the SRS §3.2 envelope — the API maps the
 * Better Auth plugin's errors (429 RATE_LIMITED, 401 OTP_INVALID) — so the
 * shared `readApiError` plumbing keeps working here.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, networkError, readApiError } from "../../reservasi/_lib/api";

const AUTH_PROXY = "/api/auth";

/** POST through the auth pipe; a 2xx body is informational and may be empty. */
async function postAuth(path: string, body: Record<string, unknown>, fallback: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${AUTH_PROXY}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw networkError();
  }
  if (!res.ok) throw await readApiError(res, fallback);
  await res.json().catch(() => null);
}

/** Send a 6-digit OTP to a canonical +62 phone (server normalizes; rate-limited). */
export function useSendOtp() {
  return useMutation<void, ApiError, string>({
    mutationFn: (phoneNumber) => postAuth("/phone-number/send-otp", { phoneNumber }, "Gagal mengirim kode OTP"),
  });
}

/** Verify the code; a 200 establishes the session cookie (HttpOnly, web origin). */
export function useVerifyOtp() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, { phoneNumber: string; code: string }>({
    mutationFn: ({ phoneNumber, code }) =>
      postAuth("/phone-number/verify", { phoneNumber, code }, "Gagal memeriksa kode OTP"),
    // The account list and the me-plate become true only after this.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["renters", "me"] });
      void queryClient.invalidateQueries({ queryKey: ["reservations", "list"] });
    },
  });
}

interface RenterMe {
  phone: string;
}

/** The signed-in renter's own profile. 401 here simply means "tamu". */
export function useRentersMe() {
  return useQuery<RenterMe, ApiError>({
    queryKey: ["renters", "me"],
    queryFn: async () => {
      let res: Response;
      try {
        res = await fetch("/api/renters/me", {
          headers: { accept: "application/json" },
          cache: "no-store",
          credentials: "same-origin",
        });
      } catch {
        throw networkError();
      }
      if (!res.ok) throw await readApiError(res, "Gagal memuat profil");
      return (await res.json()) as RenterMe;
    },
    retry: false,
    staleTime: 30_000,
  });
}
