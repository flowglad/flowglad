ALTER TABLE "organizations" ADD COLUMN "svix_livemode_application_id" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "svix_testmode_application_id" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_svix_livemode_application_id_unique" UNIQUE("svix_livemode_application_id");--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_svix_testmode_application_id_unique" UNIQUE("svix_testmode_application_id");