CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS "webhooks" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now(),
	"created_by_commit" text,
	"updated_by_commit" text,
	"livemode" boolean NOT NULL,
	"position" bigserial NOT NULL,
	"event_subscriptions" jsonb NOT NULL,
	"organization_id" text NOT NULL,
	"url" text NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "webhooks_id_unique" UNIQUE("id")
);
--> statement-breakpoint
ALTER TABLE "webhooks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "organizations" DROP CONSTRAINT "organizations_svix_livemode_application_id_unique";--> statement-breakpoint
ALTER TABLE "organizations" DROP CONSTRAINT "organizations_svix_testmode_application_id_unique";--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "security_salt" text;--> statement-breakpoint
UPDATE "organizations" SET "security_salt" = encode(gen_random_bytes(16), 'hex');--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "security_salt" SET NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webhooks_organization_id_idx" ON "webhooks" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webhooks_active_idx" ON "webhooks" USING btree ("active");--> statement-breakpoint
ALTER TABLE "organizations" DROP COLUMN IF EXISTS "svix_livemode_application_id";--> statement-breakpoint
ALTER TABLE "organizations" DROP COLUMN IF EXISTS "svix_testmode_application_id";--> statement-breakpoint
CREATE POLICY "Enable read for own organizations" ON "webhooks" AS PERMISSIVE FOR ALL TO "authenticated" USING ("organization_id" in (select "organization_id" from "memberships"));--> statement-breakpoint
CREATE POLICY "Check mode" ON "webhooks" AS RESTRICTIVE FOR ALL TO "authenticated" USING (current_setting('app.livemode')::boolean = livemode);