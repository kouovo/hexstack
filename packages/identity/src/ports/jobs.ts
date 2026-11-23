import type { JobDispatcher } from "@app/common/queue";

import type { SessionService } from "../app/session.service";

const SESSION_CLEANUP_TICK_JOB = "session-cleanup-tick";
const SESSION_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

/**
 * BullMQ repeatable job: runs once cluster-wide, whatever the replica count. Expired sessions are already rejected
 * (and deleted) on use; this removes the ones never used again.
 */
export async function scheduleSessionCleanup(dispatcher: JobDispatcher, sessions: SessionService): Promise<void> {
  dispatcher.registerJob(SESSION_CLEANUP_TICK_JOB, async () => {
    await sessions.deleteExpired();
  });
  await dispatcher.scheduleRepeat(SESSION_CLEANUP_TICK_JOB, SESSION_CLEANUP_INTERVAL_MS);
}
