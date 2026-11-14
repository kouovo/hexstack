import { DOMAIN_EVENT_PIPELINE, JOB_DISPATCHER, OUTBOX_SUBSCRIPTIONS } from "@app/application";
import { container, instanceCachingFactory } from "@app/di";
import { type ISqlQueryBuilder, SQL_QUERY_BUILDER } from "@app/persistence";

import { MillstreamDomainEventPipeline } from "./domain-event-pipeline";

export function registerPubSub() {
  container.register(DOMAIN_EVENT_PIPELINE, {
    useFactory: instanceCachingFactory(
      (c) =>
        new MillstreamDomainEventPipeline(c.resolve<ISqlQueryBuilder>(SQL_QUERY_BUILDER), OUTBOX_SUBSCRIPTIONS, c.resolve(JOB_DISPATCHER)),
    ),
  });
}
