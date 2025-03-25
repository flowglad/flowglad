ALTER TABLE "subscriptions" RENAME COLUMN "plan_name" TO "name";--> statement-breakpoint
DROP INDEX IF EXISTS "customers_email_organization_id_idx";--> statement-breakpoint
ALTER TABLE "checkout_sessions" ADD COLUMN "output_name" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "subscription_id" text;--> statement-breakpoint

UPDATE "invoices" 
SET "subscription_id" = "billing_periods"."subscription_id" 
FROM "billing_periods" 
WHERE "invoices"."billing_period_id" IS NOT NULL 
AND "invoices"."billing_period_id" = "billing_periods"."id";

DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customers_email_organization_id_livemode_idx" ON "customers" USING btree ("email","organization_id","livemode");