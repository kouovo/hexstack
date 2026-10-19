CREATE TABLE "app_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" bigserial NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"correlation_id" text,
	"causation_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 10 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"dead_at" timestamp with time zone,
	"lease_id" text,
	"lease_expires_at" timestamp with time zone,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_status_check" CHECK (status in ('pending', 'processing', 'processed', 'dead'))
);
--> statement-breakpoint
CREATE TABLE "app_todo" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"completed_at" timestamp with time zone,
	"completion_notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "todo_status_check" CHECK (status in ('open', 'completed', 'archived'))
);
--> statement-breakpoint
CREATE INDEX "outbox_pending_idx" ON "app_outbox" USING btree ("next_attempt_at","seq") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "outbox_dead_idx" ON "app_outbox" USING btree ("dead_at") WHERE status = 'dead';--> statement-breakpoint
CREATE INDEX "outbox_aggregate_idx" ON "app_outbox" USING btree ("aggregate_type","aggregate_id");--> statement-breakpoint
CREATE INDEX "outbox_event_type_idx" ON "app_outbox" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "outbox_status_idx" ON "app_outbox" USING btree ("status");--> statement-breakpoint
CREATE INDEX "todo_created_at_idx" ON "app_todo" USING btree ("created_at");