import "./lib/dotenv.js";
import { buildApp } from "./app.js";

const { app, close } = await buildApp();

const port = Number(process.env.PORT ?? 3001);

try {
  await app.listen({ port, host: "0.0.0.0" });
} catch (error) {
  app.log.error(error);
  close();
  process.exit(1);
}
