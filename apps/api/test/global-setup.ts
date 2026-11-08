/**
 * Vitest global setup — provision a DEDICATED test database so the API
 * integration suite never touches the dev database (`kayooh`) that a running
 * dev API / e2e run depends on (issue #32).
 *
 * Creates `kayooh_test` (if missing), applies the drizzle migrations and seeds
 * the §1.1 network baseline. Runs once per `vitest run`, before any worker.
 */
import { execSync } from "node:child_process";
import path from "node:path";

const REPO_ROOT = path.resolve(process.cwd(), "..", "..");
const BASE_URL = process.env.TEST_DATABASE_BASE_URL ?? "postgresql://kayooh@127.0.0.1:5433";
const TEST_DB = process.env.TEST_DATABASE_NAME ?? "kayooh_test";
const TEST_URL = process.env.TEST_DATABASE_URL ?? `${BASE_URL}/${TEST_DB}`;
const MAINT_URL = `${BASE_URL}/postgres`;

function run(cmd: string, env: NodeJS.ProcessEnv = process.env): void {
  execSync(cmd, { stdio: "inherit", env, cwd: REPO_ROOT });
}

export default async function globalSetup(): Promise<void> {
  // 1. Create the test database if it does not exist (idempotent).
  try {
    execSync(`psql "${MAINT_URL}" -c "CREATE DATABASE ${TEST_DB};"`, {
      stdio: "ignore",
    });
  } catch {
    // already exists — expected on repeat runs
  }

  // 2. Apply migrations + seed baseline data against the test database only.
  const env = { ...process.env, DATABASE_URL: TEST_URL };
  run("pnpm --filter @repo/db db:migrate", env);
  run("pnpm --filter @repo/db db:seed", env);

  // Expose the resolved URL to workers via the process env (vitest `test.env`
  // already sets this, but keep them in sync for clarity).
  process.env.DATABASE_URL = TEST_URL;
}