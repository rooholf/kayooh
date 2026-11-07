/**
 * Same-origin pipe for renter reservations (A-18/#22, #25).
 *
 * The Better Auth session lives on the API origin as an HttpOnly cookie. The
 * browser cannot read it, and the API's CORS policy deliberately does not
 * reflect credentials — so a signed-in renter's `GET /reservations*` (and the
 * session-only reallocation POSTs of FR-INV-04) could never be sent from the
 * web app directly. This route handler runs on the Next.js server: it forwards
 * the caller's cookies (and, for guest bookings, the `Authorization: Bearer
 * <guestToken>` header) to the API and returns the response verbatim.
 *
 * GET covers the read surface (list, detail, voucher, alternatives); an
 * identical POST pipe covers the reservation writes whose session only the
 * proxy can carry (reallocate / decline-reallocation, both in SRS §3.2
 * IDEMPOTENCY_ROUTES — the `Idempotency-Key` header is forwarded untouched).
 * Public write endpoints (quote, create) still go straight to the API. No
 * bike ids or coordinates ride this proxy (NEG-2/NEG-4): it copies the
 * upstream body unchanged.
 */
import type { NextRequest } from "next/server";

const API_BASE =
  process.env.API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:3001";

/** Headers the API contract consumes on this surface; everything else is dropped. */
const FORWARDED = ["authorization", "content-type", "idempotency-key"] as const;

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ path?: string[] }> };

export async function GET(request: NextRequest, ctx: RouteParams): Promise<Response> {
  return pipe(request, "GET", ctx);
}

export async function POST(request: NextRequest, ctx: RouteParams): Promise<Response> {
  return pipe(request, "POST", ctx);
}

async function pipe(
  request: NextRequest,
  method: "GET" | "POST",
  { params }: RouteParams,
): Promise<Response> {
  const { path } = await params;
  const suffix =
    path && path.length > 0 ? `/${path.map((seg) => encodeURIComponent(seg)).join("/")}` : "";
  const target = `${API_BASE}/api/v1/reservations${suffix}${request.nextUrl.search}`;

  const headers: Record<string, string> = { accept: "application/json" };
  const cookie = request.headers.get("cookie");
  if (cookie !== null) headers.cookie = cookie;
  for (const name of FORWARDED) {
    const value = request.headers.get(name);
    if (value !== null) headers[name] = value;
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method,
      headers,
      ...(method === "POST" ? { body: await request.text() } : {}),
      cache: "no-store",
    });
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
