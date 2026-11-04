/**
 * Global Fastify error handler: serializes every non-2xx response as the SRS
 * 3.2 error envelope  { error: { code, message, details?, requestId } }.
 * SKILL implement_zod_contract_route step 3: Zod validation failures arrive
 * here as AppError(VALIDATION_ERROR) with mapped details (or untouched ZodError
 * as a safety net, mapped identically).
 */
import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { AppError, validationError } from "./errors";

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, req, reply) => {
    let appError: AppError;
    if (error instanceof AppError) {
      appError = error;
    } else if (error instanceof ZodError) {
      appError = validationError(error);
    } else {
      req.log.error(error);
      appError = new AppError("INTERNAL", "Unexpected server error.");
    }

    req.log.info(
      { errCode: appError.code, status: appError.status },
      "request failed",
    );
    reply.status(appError.status).send({
      error: {
        code: appError.code,
        message: appError.message,
        ...(appError.details ? { details: appError.details } : {}),
        requestId: req.id,
      },
    });
    return reply;
  });
}
