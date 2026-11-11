import { type JobDispatcher, JOB_DISPATCHER, SessionService } from "@app/application";
import { container } from "@app/di";

const SESSION_CLEANUP_TICK_JOB = "session-cleanup-tick";
const SESSION_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
/** Ticks of the pre-millstream outbox relay; their BullMQ schedulers would otherwise keep producing jobs. */
const RETIRED_TICK_JOBS = ["outbox-relay-tick", "outbox-cleanup-tick"];

/** BullMQ repeatable jobs: each tick runs once cluster-wide, whatever the replica count. */
export const startMaintenanceScheduler = async (): Promise<void> => {
  const dispatcher = container.resolve<JobDispatcher>(JOB_DISPATCHER);
  const sessions = container.resolve(SessionService);

  for (const name of RETIRED_TICK_JOBS) await dispatcher.unscheduleRepeat(name);

  // Expired sessions are already rejected (and deleted) on use; this removes the ones never used again.
  dispatcher.registerJob(SESSION_CLEANUP_TICK_JOB, async () => {
    await sessions.deleteExpired();
  });
  await dispatcher.scheduleRepeat(SESSION_CLEANUP_TICK_JOB, SESSION_CLEANUP_INTERVAL_MS);
};
