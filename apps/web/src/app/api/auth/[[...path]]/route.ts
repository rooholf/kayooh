/**
 * Same-origin pipe for Better Auth phone-OTP sign-in (#20, FR-ID-01).
 *
 * `POST /api/auth/phone-number/send-otp` and `.../verify` run on the API
 * origin and establish the renter session as an HttpOnly cookie set by the
 * API. The web app reaches them through this Next.js server pipe so the
 * `Set-Cookie` lands on the WEB origin (the API's CORS deliberately does not
 * reflect credentials). The session cookie then rides every subsequent
 * same-origin proxy call — `GET /renters/me` via `/api/renters/me`, and the
 * reservations pipe — without the browser ever reading it (NFR-04:
 * HttpOnly; SameSite=Lax; Secure under TLS, set by the API).
 *
 * Bodies are forwarded unchanged; Better Auth error responses are not the
 * SRS envelope — the sign-in page maps copies from status + body itself.
 */
import { createApiPipe } from "../../_lib/pipe";

const handlers = createApiPipe("/api/auth");

export const dynamic = "force-dynamic";
export const GET = handlers.GET;
export const POST = handlers.POST;
