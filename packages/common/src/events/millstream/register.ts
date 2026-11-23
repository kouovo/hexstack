import type { ISqlQueryBuilder } from "../../db/kysely";
import { SQL_QUERY_BUILDER } from "../../db/query-builder";
import { container, instanceCachingFactory } from "../../di";
import { JOB_DISPATCHER } from "../../queue/queue.port";
import { DOMAIN_EVENT_PIPELINE } from "../pipeline.port";
import { EVENT_SUBSCRIPTIONS, type EventSubscriptions } from "../subscriptions";
import { MillstreamDomainEventPipeline } from "./domain-event-pipeline";

export function registerPubSub() {
  container.register(DOMAIN_EVENT_PIPELINE, {
    useFactory: instanceCachingFactory(
      (c) =>
        new MillstreamDomainEventPipeline(
          c.resolve<ISqlQueryBuilder>(SQL_QUERY_BUILDER),
          c.resolve<EventSubscriptions>(EVENT_SUBSCRIPTIONS).outbox,
          c.resolve(JOB_DISPATCHER),
        ),
    ),
  });
}
