/**
 * Shared same-origin pipe for API surfaces whose credentials only the
 * Next.js server can carry (the API's CORS deliberately reflects nothing
 * for credentialed requests).
 *
 * GET, POST and PATCH are forwarded verbatim (method, body, path, query) for an
 * upstream base path; the API's response is returned unchanged — INCLUDING
 * `Set-Cookie`: the Better Auth session cookie must land on the WEB origin
 * for the browser to attach it to subsequent same-origin proxy calls
 * (NFR-04: HttpOnly; SameSite=Lax; Secure under TLS — the API sets these).
 *
 * No bike ids or coordinates are invented anywhere on this path (NEG-2/NEG-4):
 * upstream bodies are copied cleanly.
 */
import type { NextRequest } from "next/server";

const API_BASE =
  process.env.API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:3001";

/** Headers the API contract consumes on these surfaces; everything else is dropped.
 * `origin` is forwarded for Better Auth's form-CSRF check (POST /sign-in/email
 * rejects a missing origin outright) — the value is the web origin itself. */
const FORWARDED = ["authorization", "content-type", "idempotency-key", "origin"] as const;

export const dynamic = "force-dynamic";

export type RouteParams = { params: Promise<{ path?: string[] }> };

/** Build GET/POST handlers that transparently pipe to `${upstreamBase}/**`. */
export function createApiPipe(
  upstreamBase: string,
  { networkMessage = "Tidak bisa menghubungi server." }: { networkMessage?: string } = {},
  methods: Array<"GET" | "POST" | "PATCH"> = ["GET", "POST"],
) {
  async function pipe(
    request: NextRequest,
    method: "GET" | "POST" | "PATCH",
    { params }: RouteParams,
  ): Promise<Response> {
    const { path } = await params;
    const suffix =
      path && path.length > 0
        ? `/${path.map((seg) => encodeURIComponent(seg)).join("/")}`
        : "";
    const target = `${API_BASE}${upstreamBase}${suffix}${request.nextUrl.search}`;

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
        ...(method === "POST" || method === "PATCH" ? { body: await request.text() } : {}),
        cache: "no-store",
      });
    } catch {
      return Response.json(
        { error: { code: "NETWORK", message: networkMessage } },
        { status: 502 },
      );
    }

    const body = await upstream.text();
    const responseHeaders = new Headers({
      "content-type": upstream.headers.get("content-type") ?? "application/json",
      "cache-control": "no-store",
    });
    for (const c of upstream.headers.getSetCookie()) {
      responseHeaders.append("set-cookie", c);
    }
    return new Response(body, { status: upstream.status, headers: responseHeaders });
  }

  return {
    GET: (request: NextRequest, ctx: RouteParams): Promise<Response> =>
      pipe(request, "GET", ctx),
    POST: (request: NextRequest, ctx: RouteParams): Promise<Response> =>
      pipe(request, "POST", ctx),
    ...(methods.includes("PATCH")
      ? {
          PATCH: (request: NextRequest, ctx: RouteParams): Promise<Response> =>
            pipe(request, "PATCH", ctx),
        }
      : {}),
  };
}
