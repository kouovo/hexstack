import { DOMAIN_EVENT_PIPELINE, DURABLE_EVENT_SUBSCRIPTIONS } from "@app/application";
import { container, instanceCachingFactory } from "@app/di";
import { type ISqlQueryBuilder, SQL_QUERY_BUILDER } from "@app/persistence";

import { MillstreamDomainEventPipeline } from "./domain-event-pipeline";

/** Durable event delivery (millstream outbox relay + BullMQ); the subscriptions are listed in @app/application. */
export function registerPubSub() {
  container.register(DOMAIN_EVENT_PIPELINE, {
    useFactory: instanceCachingFactory(
      (c) =>
        new MillstreamDomainEventPipeline(c.resolve<ISqlQueryBuilder>(SQL_QUERY_BUILDER), DURABLE_EVENT_SUBSCRIPTIONS, (handler) =>
          c.resolve(handler),
        ),
    ),
  });
}
