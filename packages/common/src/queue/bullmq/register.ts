import { container, instanceCachingFactory } from "../../di";
import { getRedisOptions } from "../../redis/options";
import { JOB_DISPATCHER } from "../queue.port";
import { BullMQJobDispatcher } from "./bullmq-job-dispatcher.adapter";

export type RegisterQueueOptions = {
  /** false = producer only (e.g. the CLI); jobs can be enqueued but no Worker is started. */
  enableWorkers?: boolean;
};

export function registerQueue({ enableWorkers = true }: RegisterQueueOptions = {}) {
  container.register(JOB_DISPATCHER, {
    useFactory: instanceCachingFactory(() => new BullMQJobDispatcher(getRedisOptions(), enableWorkers)),
  });
}
