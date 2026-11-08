/**
 * Same-origin pipe for renter reservations (A-18/#22, #25).
 *
 * The Better Auth session lives on the API origin as an HttpOnly cookie. The
 * browser cannot read it, and the API's CORS policy deliberately does not
 * reflect credentials — so a signed-in renter's `GET /reservations*` (and the
 * session-only reallocation POSTs of FR-INV-04) could never be sent from the
 * web app directly. This route runs on the Next.js server and forwards the
 * caller's cookies (and, for guest bookings, the `Authorization: Bearer
 * <guestToken>` header) to the API, returning the response verbatim.
 *
 * GET covers the read surface (list, detail, voucher, alternatives); the POST
 * pipe covers the reservation writes whose session only the proxy can carry
 * (reallocate / decline-reallocation — the `Idempotency-Key` header is
 * forwarded untouched). Public write endpoints (quote, create) still go
 * straight to the API. No bike ids or coordinates ride this proxy
 * (NEG-2/NEG-4): it copies the upstream body unchanged.
 */
import { createApiPipe } from "../../_lib/pipe";

const handlers = createApiPipe("/api/v1/reservations", {
  networkMessage: "Tidak bisa menghubungi server reservasi.",
});

export const dynamic = "force-dynamic";
export const GET = handlers.GET;
export const POST = handlers.POST;
