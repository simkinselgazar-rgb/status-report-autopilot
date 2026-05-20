CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"recipient" text NOT NULL,
	"voice_tone" text NOT NULL,
	"voice_length" text NOT NULL,
	"voice_signoff" text DEFAULT '' NOT NULL,
	"voice_sample" text DEFAULT '' NOT NULL,
	"cadence_day" text NOT NULL,
	"cadence_time" text NOT NULL,
	"asana_connection" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"period_label" text NOT NULL,
	"status" text NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"events_used" integer NOT NULL,
	"draft" jsonb,
	"insufficient_reason" text,
	"source_events" jsonb NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;