import { type DomainEvent } from "@app/core";
import { inject, singleton } from "@app/di";

import { deriveAggregateType } from "../shared/aggregate-type";
import { isDurableEventType } from "./durable-event-types";
import { type IOutboxRepository, injectOutboxRepo } from "./outbox.repository.port";

export interface IOutboxService {
  /** Called inside the business transaction; events without durable consumers are not stored. */
  append(events: DomainEvent[]): Promise<void>;
}

@singleton()
export class OutboxService implements IOutboxService {
  constructor(@injectOutboxRepo() private readonly outboxRepo: IOutboxRepository) {}

  async append(events: DomainEvent[]): Promise<void> {
    for (const event of events) {
      if (!isDurableEventType(event.eventType)) continue;
      // Timestamp and causation stay in the serialized event's metadata; they are not duplicated as columns.
      await this.outboxRepo.insert({
        id: event.id,
        aggregateType: deriveAggregateType(event.eventType),
        aggregateId: event.aggregateId,
        eventType: event.eventType,
        payload: event,
        correlationId: event.metadata.correlationId ?? null,
      });
    }
  }
}

export const injectOutboxService = () => inject(OutboxService);
