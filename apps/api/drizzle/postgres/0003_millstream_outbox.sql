-- The outbox moves to millstream: a queue-type topic (`@millstream/pg` queueTopicSchemaSql('outbox')) whose rows
-- are forwarder envelopes, relayed to BullMQ by the domain-event pipeline. Not compatible with old processes:
-- stop them first, and let the old BullMQ `domain-event` queue drain (or retry its failed jobs) beforehand,
-- because nothing consumes that queue any more.
CREATE TABLE IF NOT EXISTS "millstream_queue_outbox" (
  id BIGSERIAL PRIMARY KEY,
  uuid TEXT NOT NULL,
  payload BYTEA NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  delayed_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "millstream_queue_outbox_due" ON "millstream_queue_outbox" (delayed_until, id);--> statement-breakpoint
-- Carry unpublished rows over, in their original order, converted to the millstream event format (rows already
-- handed to BullMQ are done). Only TodoCompletedEvent had a durable consumer, so it is the only event type stored;
-- it becomes `todo.completed.v1` with payload { todoId, completedAt } and the `name` metadata of @millstream/cqrs.
INSERT INTO "millstream_queue_outbox" (uuid, payload, metadata)
SELECT
  gen_random_uuid()::text,
  convert_to(jsonb_build_object(
    'destination_topic', o.name,
    'uuid', o.id,
    'payload', replace(encode(convert_to(o.payload::text, 'UTF8'), 'base64'), E'\n', ''),
    'metadata', o.metadata
  )::text, 'UTF8'),
  o.metadata
FROM (
  SELECT
    id,
    seq,
    'todo.completed.v1' AS name,
    jsonb_build_object('todoId', aggregate_id, 'completedAt', payload->'completedAt') AS payload,
    jsonb_strip_nulls(jsonb_build_object('name', 'todo.completed.v1', 'correlation_id', correlation_id)) AS metadata
  FROM "app_outbox"
  WHERE published_at IS NULL AND event_type = 'TodoCompletedEvent'
) o
ORDER BY o.seq;--> statement-breakpoint
DROP TABLE "app_outbox" CASCADE;
