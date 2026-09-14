import { buildApp } from "./app.js";
import { startScheduler } from "./proactive/scheduler.js";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

const app = buildApp();

app
  .listen({ port, host })
  .then(() => startScheduler())
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
