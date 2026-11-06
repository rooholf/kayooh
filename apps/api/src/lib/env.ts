/**
 * Environment configuration (SRS 2: secrets in environment, never in the repo).
 * Fail-fast at boot for required secrets in production.
 */
export interface Env {
  nodeEnv: "development" | "test" | "production";
  databaseUrl: string;
  redisUrl?: string;
  authSecret: string;
  logLevel: string;
  /** Callback token compared by the gateway webhook check (FR-PAY-02.1). */
  paymentWebhookSecret: string;
  /** Dev convenience ONLY: never set in production (OTP codes must not be logged). */
  devLogOtp: boolean;
}

export function loadEnv(overrides: Partial<Record<string, string | undefined>> = {}): Env {
  const get = (k: string): string | undefined =>
    overrides[k] ?? process.env[k];
  const nodeEnv = (get("NODE_ENV") ?? "development") as Env["nodeEnv"];
  const databaseUrl = get("DATABASE_URL");
  const authSecret = get("BETTER_AUTH_SECRET") ?? get("AUTH_SECRET");
  const env: Env = {
    nodeEnv,
    databaseUrl: databaseUrl ?? "",
    redisUrl: get("REDIS_URL"),
    authSecret: authSecret ?? "",
    logLevel: get("LOG_LEVEL") ?? "info",
    paymentWebhookSecret: get("PAYMENT_WEBHOOK_SECRET") ?? "dev-fake-webhook-secret",
    devLogOtp: get("DEV_LOG_OTP") === "true",
  };
  if (nodeEnv === "production") {
    const missing: string[] = [];
    if (!env.databaseUrl) missing.push("DATABASE_URL");
    if (!env.authSecret) missing.push("BETTER_AUTH_SECRET");
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
    }
    if (env.devLogOtp) {
      throw new Error("DEV_LOG_OTP=true is forbidden in production (NFR-06)");
    }
  }
  return env;
}
