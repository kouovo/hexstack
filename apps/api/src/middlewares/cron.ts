import {
  type JobDispatcher,
  JOB_DISPATCHER,
  type OutboxEventWorker,
  OUTBOX_EVENT_WORKER,
  type OutboxRelay,
  OUTBOX_RELAY,
  SessionService,
} from "@app/application";
import { container } from "@app/di";
import { env } from "@app/env";

const OUTBOX_RELAY_TICK_JOB = "outbox-relay-tick";
const OUTBOX_CLEANUP_TICK_JOB = "outbox-cleanup-tick";
const SESSION_CLEANUP_TICK_JOB = "session-cleanup-tick";
const SESSION_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Periodic maintenance runs as BullMQ repeatable jobs, so with N replicas each tick executes once
 * cluster-wide. Add new ticks here (register + scheduleRepeat).
 */
export const startMaintenanceScheduler = async (): Promise<void> => {
  const dispatcher = container.resolve<JobDispatcher>(JOB_DISPATCHER);
  const outboxRelay = container.resolve<OutboxRelay>(OUTBOX_RELAY);
  const outboxEventWorker = container.resolve<OutboxEventWorker>(OUTBOX_EVENT_WORKER);
  const sessions = container.resolve(SessionService);

  // Durable consumers run in the BullMQ `domain-event` worker; the relay only publishes committed rows.
  outboxEventWorker.registerJobs();
  dispatcher.registerJob(OUTBOX_RELAY_TICK_JOB, async () => {
    await outboxRelay.tick();
  });
  dispatcher.registerJob(OUTBOX_CLEANUP_TICK_JOB, async () => {
    await outboxRelay.cleanup();
  });
  await dispatcher.scheduleRepeat(OUTBOX_RELAY_TICK_JOB, env.OUTBOX_RELAY_TICK_INTERVAL_MS);
  await dispatcher.scheduleRepeat(OUTBOX_CLEANUP_TICK_JOB, env.OUTBOX_CLEANUP_TICK_INTERVAL_MS);

  // Expired sessions are already rejected (and deleted) on use; this removes the ones never used again.
  dispatcher.registerJob(SESSION_CLEANUP_TICK_JOB, async () => {
    await sessions.deleteExpired();
  });
  await dispatcher.scheduleRepeat(SESSION_CLEANUP_TICK_JOB, SESSION_CLEANUP_INTERVAL_MS);
};
