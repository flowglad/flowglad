ALTER TABLE "organizations" DROP CONSTRAINT "organizations_svix_livemode_application_id_unique";--> statement-breakpoint
ALTER TABLE "organizations" DROP CONSTRAINT "organizations_svix_testmode_application_id_unique";--> statement-breakpoint
ALTER TABLE "organizations" DROP COLUMN IF EXISTS "svix_livemode_application_id";--> statement-breakpoint
ALTER TABLE "organizations" DROP COLUMN IF EXISTS "svix_testmode_application_id";