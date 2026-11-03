import Fastify from "fastify";

const app = Fastify({ logger: true });

app.get("/healthz", async () => ({ status: "ok" }));
app.get("/readyz", async () => ({ status: "ok" }));

const port = Number(process.env.PORT ?? 3001);

app
  .listen({ port, host: "0.0.0.0" })
  .catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
