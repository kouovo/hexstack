ALTER TABLE "app_outbox" DROP CONSTRAINT "outbox_status_check";--> statement-breakpoint
DROP INDEX "outbox_pending_idx";--> statement-breakpoint
DROP INDEX "outbox_dead_idx";--> statement-breakpoint
DROP INDEX "outbox_aggregate_idx";--> statement-breakpoint
DROP INDEX "outbox_event_type_idx";--> statement-breakpoint
DROP INDEX "outbox_status_idx";--> statement-breakpoint
ALTER TABLE "app_outbox" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
-- Not compatible with old relay processes: stop old API/relay processes before migrating.
-- processed rows count as already published; pending/processing/dead rows are republished to BullMQ
-- and receive a fresh attempt budget there (review dead rows before deploying: consumers may run again).
UPDATE "app_outbox" SET "published_at" = coalesce("processed_at", "created_at") WHERE "status" = 'processed';--> statement-breakpoint
-- Earlier versions could store the payload double-encoded as a JSON string; decode it back to an object.
UPDATE "app_outbox" SET "payload" = ("payload" #>> '{}')::jsonb WHERE jsonb_typeof("payload") = 'string';--> statement-breakpoint
-- Keep envelope data from dropped columns in payload metadata, never overwriting values already there.
UPDATE "app_outbox" SET "payload" = jsonb_set(
  "payload",
  '{metadata}',
  jsonb_strip_nulls(jsonb_build_object(
    'timestamp', floor(extract(epoch from "occurred_at") * 1000)::bigint,
    'correlationId', "correlation_id",
    'causationId', "causation_id"
  )) || coalesce("payload"->'metadata', '{}'::jsonb)
) WHERE jsonb_typeof("payload") = 'object' AND jsonb_typeof(coalesce("payload"->'metadata', '{}'::jsonb)) = 'object';--> statement-breakpoint
CREATE INDEX "outbox_unpublished_idx" ON "app_outbox" USING btree ("seq") WHERE published_at is null;--> statement-breakpoint
ALTER TABLE "app_outbox" DROP COLUMN "causation_id";--> statement-breakpoint
ALTER TABLE "app_outbox" DROP COLUMN "status";--> statement-breakpoint
ALTER TABLE "app_outbox" DROP COLUMN "attempts";--> statement-breakpoint
ALTER TABLE "app_outbox" DROP COLUMN "max_attempts";--> statement-breakpoint
ALTER TABLE "app_outbox" DROP COLUMN "next_attempt_at";--> statement-breakpoint
ALTER TABLE "app_outbox" DROP COLUMN "last_error";--> statement-breakpoint
ALTER TABLE "app_outbox" DROP COLUMN "dead_at";--> statement-breakpoint
ALTER TABLE "app_outbox" DROP COLUMN "lease_id";--> statement-breakpoint
ALTER TABLE "app_outbox" DROP COLUMN "lease_expires_at";--> statement-breakpoint
ALTER TABLE "app_outbox" DROP COLUMN "occurred_at";--> statement-breakpoint
ALTER TABLE "app_outbox" DROP COLUMN "processed_at";--> statement-breakpoint
ALTER TABLE "app_outbox" DROP COLUMN "updated_at";