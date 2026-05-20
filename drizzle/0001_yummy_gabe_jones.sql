ALTER TABLE "reports" ADD COLUMN "share_token" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_share_token_unique" UNIQUE("share_token");