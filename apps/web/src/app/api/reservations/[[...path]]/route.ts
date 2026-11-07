/**
 * Same-origin read proxy for renter reservations (A-18/#22).
 *
 * The Better Auth session lives on the API origin as an HttpOnly cookie. The
 * browser cannot read it, and the API's CORS policy deliberately does not
 * reflect credentials — so a signed-in renter's `GET /reservations` list could
 * never be sent from the web app directly. This route handler runs on the
 * Next.js server: it forwards the caller's cookies (and, for guest bookings,
 * the `Authorization: Bearer <guestToken>` header) to the API and returns the
 * response verbatim.
 *
 * It is a transparent GET pipe for the `/api/v1/reservations/**` read surface
 * only — the public write endpoints (quote, create) still go straight to the
 * API. No bike ids or coordinates ride this proxy (NEG-2/NEG-4): it copies the
 * upstream body unchanged.
 */
import type { NextRequest } from "next/server";

const API_BASE =
  process.env.API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:3001";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> },
): Promise<Response> {
  const { path } = await params;
  const suffix =
    path && path.length > 0 ? `/${path.map((seg) => encodeURIComponent(seg)).join("/")}` : "";
  const target = `${API_BASE}/api/v1/reservations${suffix}${request.nextUrl.search}`;

  const headers: Record<string, string> = { accept: "application/json" };
  const cookie = request.headers.get("cookie");
  if (cookie !== null) headers.cookie = cookie;
  const authorization = request.headers.get("authorization");
  if (authorization !== null) headers.authorization = authorization;

  let upstream: Response;
  try {
    upstream = await fetch(target, { headers, cache: "no-store" });
  } catch {
    return Response.json(
      { error: { code: "NETWORK", message: "Tidak bisa menghubungi server reservasi." } },
      { status: 502 },
    );
  }

  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/json",
      "cache-control": "no-store",
    },
  });
}
