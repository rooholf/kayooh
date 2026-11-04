/**
 * pino redaction paths (NFR-06 / NEG-4): renter coordinates, phones, tokens
 * and passwords never reach the logs.
 * Note: pino redact must be configured at logger construction; `pinoRedact`
 * is passed into Fastify's logger options in app.ts.
 */
export const pinoRedact = {
  paths: [
    "req.headers.authorization",
    "req.headers.cookie",
    "req.body.phoneNumber",
    "req.body.phone",
    "req.body.voucherToken",
    "req.body.token",
    "req.body.password",
    "req.body.lat",
    "req.body.lng",
    "req.body.latitude",
    "req.body.longitude",
    "req.query.lat",
    "req.query.lng",
    "req.query.latitude",
    "req.query.longitude",
    "res.headers['set-cookie']",
    "*.phoneNumber",
    "*.phone",
    "*.password",
    "*.token",
    "*.voucherToken",
    "*.lat",
    "*.lng",
    "*.latitude",
    "*.longitude",
    "*.code", // OTP codes must never appear in logs
  ],
  censor: "[redacted]",
};
