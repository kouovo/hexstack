import { singleton } from "@app/di";
import type { TodoCompletedEvent } from "@app/domain";

import type { EventHandler } from "../events/subscription";
import { injectJobDispatcher, type JobDispatcher } from "../queue/queue.port";
import {
  NOTIFY_TODO_COMPLETED_JOB_NAME,
  notifyTodoCompletedJobId,
  notifyTodoCompletedJobPayloadSchema,
} from "./jobs/notify-todo-completed.job";

/** At-least-once: the deterministic job id makes a redelivery a no-op while the job is retained. */
@singleton()
export class DispatchTodoCompletedOutboxHandler implements EventHandler<TodoCompletedEvent> {
  constructor(@injectJobDispatcher() private readonly dispatcher: JobDispatcher) {}

  async handle(event: TodoCompletedEvent): Promise<void> {
    const payload = notifyTodoCompletedJobPayloadSchema.parse({ todoId: event.todoId });
    await this.dispatcher.enqueue(NOTIFY_TODO_COMPLETED_JOB_NAME, payload, {
      jobId: notifyTodoCompletedJobId(event.todoId),
      attempts: 5,
      backoffDelay: 1_000,
    });
  }
}
