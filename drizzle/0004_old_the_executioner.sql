ALTER TABLE "clients" ADD COLUMN "timezone" text DEFAULT 'America/New_York' NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "period_start" date NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "reports_client_period_uq" ON "reports" USING btree ("client_id","period_start");