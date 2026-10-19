import { inject } from "@app/di";

export type JobHandler = (payload: unknown) => Promise<void>;

export interface RegisterJobOptions {
  concurrency?: number;
}

export interface EnqueueOptions {
  jobId?: string;
  delay?: number;
  debounce?: {
    id: string;
    ttl: number;
  };
  attempts?: number;
  backoffDelay?: number;
}

export interface JobDispatcher {
  enqueue(name: string, payload: unknown, opts?: EnqueueOptions): Promise<void>;
  registerJob(name: string, handler: JobHandler, opts?: RegisterJobOptions): void;
  scheduleRepeat(name: string, intervalMs: number): Promise<void>;
}

export const JOB_DISPATCHER = Symbol.for("JOB_DISPATCHER");
export const injectJobDispatcher = () => inject(JOB_DISPATCHER);
