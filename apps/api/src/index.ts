// Keep first: the OpenTelemetry SDK must own the global providers before any app module loads.
// Side-effect import on purpose: import sorting never moves those.
import "./telemetry";
import "reflect-metadata";
import { DOMAIN_EVENT_PIPELINE, type DomainEventPipeline } from "@app/application";
import { registerDI } from "@app/bootstrap";
import { container } from "@app/di";
import { env } from "@app/env";
import { serve } from "@hono/node-server";

import pkg from "../package.json";
import { createApp } from "./app";
import { startMaintenanceScheduler } from "./middlewares/cron";
import { appLogger } from "./middlewares/logger";
import { shutdownTelemetry } from "./telemetry";

registerDI();

const app = createApp();

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  appLogger.info({ version: pkg.version }, `App is running at ${info.address}:${info.port}`);
});

// Migrations intentionally do NOT run here: with multiple replicas every boot would race.
// Run `pnpm db:migrate` (CLI) as a one-shot step before rolling out new API code.
await startMaintenanceScheduler();

// Runs in every replica.
const domainEvents = container.resolve<DomainEventPipeline>(DOMAIN_EVENT_PIPELINE);
await domainEvents.start();

let shuttingDown = false;
const shutdown = (signal: NodeJS.Signals) => {
  if (shuttingDown) return;
  shuttingDown = true;
  appLogger.info({ signal }, "shutting down");
  server.close();
  // In-flight deliveries finish (or go back to their queue) before the process exits.
  void domainEvents
    .close()
    .catch((error: unknown) => appLogger.error({ err: error }, "domain-event pipeline close failed"))
    .then(() => shutdownTelemetry())
    .finally(() => process.exit(0));
};
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
