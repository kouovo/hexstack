import type { IEventHandler } from "@app/cqrs";
import { singleton } from "@app/di";
import { TodoCompletedEvent } from "@app/domain";

import { outboxHandler } from "../pubsub/outbox-handler.decorator";
import { injectJobDispatcher, type JobDispatcher } from "../queue/queue.port";
import {
  NOTIFY_TODO_COMPLETED_JOB_NAME,
  notifyTodoCompletedJobId,
  notifyTodoCompletedJobPayloadSchema,
} from "./jobs/notify-todo-completed.job";

/**
 * Durable consumer: runs in the `domain-event` worker and hands off to a dedicated job.
 * The explicit consumer id keeps BullMQ job ids stable if this class is renamed.
 */
@outboxHandler(TodoCompletedEvent, "todo.dispatch-completion-notification")
@singleton()
export class DispatchTodoCompletedOutboxHandler implements IEventHandler<TodoCompletedEvent> {
  constructor(@injectJobDispatcher() private readonly dispatcher: JobDispatcher) {}

  async handle(event: TodoCompletedEvent): Promise<void> {
    const payload = notifyTodoCompletedJobPayloadSchema.parse({ todoId: event.aggregateId });
    await this.dispatcher.enqueue(NOTIFY_TODO_COMPLETED_JOB_NAME, payload, {
      jobId: notifyTodoCompletedJobId(event.aggregateId),
      attempts: 5,
      backoffDelay: 1_000,
    });
  }
}
