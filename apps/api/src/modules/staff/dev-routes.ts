/**
 * Dev storage sink for the FIXTURE StorageProvider (plan C.2.3 — issue #41).
 * Non-production only: the PWA PUTs the photo object here, the fixture
 * provider records it so the V-PHOTO-KEY HEAD rule (must exist, <= 5 MiB)
 * has real truth to check against. A real S3/MinIO adapter replaces both.
 */
import type { FastifyInstance } from "fastify";
import { vPhotoKey } from "@repo/contracts";
import { AppError, validationError } from "../../lib/errors.js";
import { MAX_PHOTO_BYTES, getStorageProvider } from "./photo-storage.js";

export function registerDevStorageRoutes(
  app: FastifyInstance,
  opts: { nodeEnv: string },
): void {
  if (opts.nodeEnv === "production") return;

  // Raw bytes for the PWA's PUT (only registered in non-production).
  app.addContentTypeParser(
    "application/octet-stream",
    { parseAs: "buffer" },
    (_req, body, done) => done(null, body),
  );

  app.put("/api/v1/dev/storage/*", async (request, reply) => {
    const key = (request.params as { "*": string })["*"];
    const parsed = vPhotoKey.safeParse(key);
    if (!parsed.success) throw validationError(parsed.error);
    const body = request.body as Buffer | undefined;
    if (!body || !(body instanceof Buffer)) {
      throw new AppError("VALIDATION_ERROR", "Request body must be the raw object bytes.");
    }
    if (body.byteLength > MAX_PHOTO_BYTES) {
      throw new AppError("VALIDATION_ERROR", "Object exceeds the 5 MiB V-PHOTO-KEY limit.");
    }
    await getStorageProvider().put(parsed.data, body);
    return reply.code(200).send({ ok: true, key: parsed.data });
  });
}
