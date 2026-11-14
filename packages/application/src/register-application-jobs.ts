import { container } from "@app/di";

import { registerOutboxWorkers } from "./events/outbox-workers";
import { OUTBOX_SUBSCRIPTIONS } from "./events/subscriptions";
import { JOB_DISPATCHER, type JobDispatcher } from "./queue/queue.port";

/** Explicit startup registration; resolving a handler never starts workers by itself. */
export function registerApplicationJobs(): void {
  registerOutboxWorkers(OUTBOX_SUBSCRIPTIONS, container.resolve<JobDispatcher>(JOB_DISPATCHER), (handler) => container.resolve(handler));
}
