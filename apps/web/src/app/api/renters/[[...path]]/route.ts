/**
 * Same-origin pipe for `GET /api/v1/renters/me` (#20).
 *
 * The renter session is an HttpOnly cookie set on the WEB origin by the auth
 * pipe; this route forwards it (with any `Authorization: Bearer <guestToken>`)
 * so the browser never reads the cookie itself. Returns `{ phone }` for a
 * renter session; 401 otherwise (sign-in is optional — never a gate, SRS §6.1).
 */
import { createApiPipe } from "../../_lib/pipe";

const handlers = createApiPipe("/api/v1/renters");

export const dynamic = "force-dynamic";
export const GET = handlers.GET;
