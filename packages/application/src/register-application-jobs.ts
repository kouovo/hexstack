import { registerJobs } from "./queue/register-jobs";
import { NotifyTodoCompletedJobHandler } from "./todo/jobs/notify-todo-completed.job";

/** MQ consumers only. This list neither subscribes to events nor configures Outbox. */
export function registerApplicationJobs(): void {
  registerJobs([NotifyTodoCompletedJobHandler]);
}
