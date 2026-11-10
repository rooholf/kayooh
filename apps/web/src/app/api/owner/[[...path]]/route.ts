/**
 * Same-origin pipe for owner endpoints (dashboard, rentals, bikes, settings).
 *
 * In production, the owner session is an HttpOnly cookie, so the browser must
 * go through this Next.js server relay. In development (no owner session yet),
 * this pipe also handles the dev-only summary endpoint.
 */
import { createApiPipe } from "../../_lib/pipe";

const handlers = createApiPipe("/api/v1/owner", {
  networkMessage: "Tidak bisa menghubungi server pemilik.",
});

export const dynamic = "force-dynamic";
export const GET = handlers.GET;
export const POST = handlers.POST;
