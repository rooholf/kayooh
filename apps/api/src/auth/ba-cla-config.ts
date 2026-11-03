// Temporary config used ONLY by @better-auth/cli generate to emit the canonical
// Drizzle schema for better-auth@1.7.15. Delete after schema extraction.
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth";
import { phoneNumber } from "better-auth/plugins";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? "" });

export const auth = betterAuth({
  database: drizzleAdapter(pool, { provider: "pg" }),
  emailAndPassword: { enabled: true },
  plugins: [
    phoneNumber({
      sendOTP: async () => {},
    }),
  ],
});
