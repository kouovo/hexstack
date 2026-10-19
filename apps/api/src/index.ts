import "reflect-metadata";
import { registerDI } from "@app/bootstrap";
import { env } from "@app/env";
import { serve } from "@hono/node-server";

import pkg from "../package.json";
import { createApp } from "./app";
import { startMaintenanceScheduler } from "./middlewares/cron";
import { appLogger } from "./middlewares/logger";

registerDI();

const app = createApp();

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  appLogger.info({ version: pkg.version }, `App is running at ${info.address}:${info.port}`);
});

// Migrations intentionally do NOT run here: with multiple replicas every boot would race.
// Run `pnpm db:migrate` (CLI) as a one-shot step before rolling out new API code.
await startMaintenanceScheduler();
