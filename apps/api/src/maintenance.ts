import { container } from "@app/common/di";
import { JOB_DISPATCHER, type JobDispatcher } from "@app/common/queue";
import { scheduleSessionCleanup, SessionService } from "@app/identity";

/** Ticks of the pre-millstream outbox relay; their BullMQ schedulers would otherwise keep producing jobs. */
const RETIRED_TICK_JOBS = ["outbox-relay-tick", "outbox-cleanup-tick"];

/** BullMQ repeatable jobs: each tick runs once cluster-wide, whatever the replica count. */
export const startMaintenanceScheduler = async (): Promise<void> => {
  const dispatcher = container.resolve<JobDispatcher>(JOB_DISPATCHER);
  for (const name of RETIRED_TICK_JOBS) await dispatcher.unscheduleRepeat(name);
  await scheduleSessionCleanup(dispatcher, container.resolve(SessionService));
};
