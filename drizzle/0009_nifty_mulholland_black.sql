ALTER TABLE "invitation" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "member" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "organization" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "subscription" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "invitation" CASCADE;--> statement-breakpoint
DROP TABLE "member" CASCADE;--> statement-breakpoint
DROP TABLE "organization" CASCADE;--> statement-breakpoint
DROP TABLE "subscription" CASCADE;--> statement-breakpoint
ALTER TABLE "clients" DROP CONSTRAINT IF EXISTS "clients_agency_id_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "clients" DROP COLUMN "agency_id";--> statement-breakpoint
ALTER TABLE "session" DROP COLUMN "active_organization_id";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "stripe_customer_id";