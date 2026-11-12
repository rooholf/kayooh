/**
 * Same-origin pipe for admin endpoints (SRS 7.4).
 *
 * The admin session is an HttpOnly cookie, so the browser relays every
 * admin call through this Next.js server route; `Set-Cookie` from the API
 * (e.g. after sign-out) lands on the web origin untouched (NFR-04).
 */
import { createApiPipe } from "../../_lib/pipe";

const handlers = createApiPipe(
  "/api/v1/admin",
  { networkMessage: "Tidak bisa menghubungi server admin." },
  ["GET", "POST", "PATCH"],
);

export const dynamic = "force-dynamic";
export const GET = handlers.GET;
export const POST = handlers.POST;
export const PATCH = handlers.PATCH;
