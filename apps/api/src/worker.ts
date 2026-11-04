import { startWorker, registerSweeperSchedule } from "./modules/jobs/index.js";
import { loadEnv } from "./lib/env.js";

const env = loadEnv();
if (!env.redisUrl) {
  console.error("REDIS_URL is required to run the worker");
  process.exit(1);
}
await registerSweeperSchedule(env.redisUrl);
const worker = await startWorker(env.redisUrl);
console.info(JSON.stringify({ event: "worker.started", redis: true }));

const shutdown = async () => {
  await worker.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
