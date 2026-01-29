ALTER TABLE "ApiKeys" RENAME TO "api_keys";--> statement-breakpoint
ALTER TABLE "BillingPeriodItems" RENAME TO "billing_period_items";--> statement-breakpoint
ALTER TABLE "BillingPeriods" RENAME TO "billing_periods";--> statement-breakpoint
ALTER TABLE "BillingRuns" RENAME TO "billing_runs";--> statement-breakpoint
ALTER TABLE "Countries" RENAME TO "countries";--> statement-breakpoint
ALTER TABLE "api_keys" DROP CONSTRAINT "ApiKeys_id_unique";--> statement-breakpoint
ALTER TABLE "billing_period_items" DROP CONSTRAINT "BillingPeriodItems_id_unique";--> statement-breakpoint
-- ALTER TABLE "billing_periods" DROP CONSTRAINT "BillingPeriods_id_unique";--> statement-breakpoint
-- ALTER TABLE "countries" DROP CONSTRAINT "Countries_id_unique";--> statement-breakpoint
ALTER TABLE "billing_runs" DROP CONSTRAINT "BillingRuns_id_unique";--> statement-breakpoint
ALTER TABLE "countries" DROP CONSTRAINT "Countries_name_unique";--> statement-breakpoint
ALTER TABLE "countries" DROP CONSTRAINT "Countries_code_unique";--> statement-breakpoint
ALTER TABLE "api_keys" DROP CONSTRAINT "ApiKeys_organization_id_Organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "billing_period_items" DROP CONSTRAINT "BillingPeriodItems_billing_period_id_BillingPeriods_id_fk";
--> statement-breakpoint
ALTER TABLE "billing_period_items" DROP CONSTRAINT "BillingPeriodItems_discount_redemption_id_DiscountRedemptions_id_fk";
--> statement-breakpoint
ALTER TABLE "billing_periods" DROP CONSTRAINT "BillingPeriods_subscription_id_Subscriptions_id_fk";
--> statement-breakpoint
ALTER TABLE "billing_runs" DROP CONSTRAINT "BillingRuns_billing_period_id_BillingPeriods_id_fk";
--> statement-breakpoint
ALTER TABLE "billing_runs" DROP CONSTRAINT "BillingRuns_subscription_id_Subscriptions_id_fk";
--> statement-breakpoint
ALTER TABLE "billing_runs" DROP CONSTRAINT "BillingRuns_payment_method_id_PaymentMethods_id_fk";
--> statement-breakpoint
ALTER TABLE "FeeCalculations" DROP CONSTRAINT "FeeCalculations_BillingPeriodId_BillingPeriods_id_fk";
--> statement-breakpoint
ALTER TABLE "Invoices" DROP CONSTRAINT "Invoices_billing_period_id_BillingPeriods_id_fk";
--> statement-breakpoint
ALTER TABLE "Organizations" DROP CONSTRAINT IF EXISTS "Organizations_CountryId_Countries_id_fk";
--> statement-breakpoint
ALTER TABLE "Payments" DROP CONSTRAINT "Payments_BillingPeriodId_BillingPeriods_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "ApiKeys_organization_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "BillingPeriodItems_billing_period_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "BillingPeriodItems_discount_redemption_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "BillingPeriods_subscription_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "BillingPeriods_status_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "BillingRuns_billing_period_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "BillingRuns_status_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Countries_name_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Countries_code_unique_idx";--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organization_id_Organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."Organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "billing_period_items" ADD CONSTRAINT "billing_period_items_billing_period_id_billing_periods_id_fk" FOREIGN KEY ("billing_period_id") REFERENCES "public"."billing_periods"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "billing_period_items" ADD CONSTRAINT "billing_period_items_discount_redemption_id_DiscountRedemptions_id_fk" FOREIGN KEY ("discount_redemption_id") REFERENCES "public"."DiscountRedemptions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "billing_periods" ADD CONSTRAINT "billing_periods_subscription_id_Subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."Subscriptions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "billing_runs" ADD CONSTRAINT "billing_runs_billing_period_id_billing_periods_id_fk" FOREIGN KEY ("billing_period_id") REFERENCES "public"."billing_periods"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "billing_runs" ADD CONSTRAINT "billing_runs_subscription_id_Subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."Subscriptions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "billing_runs" ADD CONSTRAINT "billing_runs_payment_method_id_PaymentMethods_id_fk" FOREIGN KEY ("payment_method_id") REFERENCES "public"."PaymentMethods"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "FeeCalculations" ADD CONSTRAINT "FeeCalculations_BillingPeriodId_billing_periods_id_fk" FOREIGN KEY ("BillingPeriodId") REFERENCES "public"."billing_periods"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Invoices" ADD CONSTRAINT "Invoices_billing_period_id_billing_periods_id_fk" FOREIGN KEY ("billing_period_id") REFERENCES "public"."billing_periods"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Organizations" ADD CONSTRAINT "Organizations_CountryId_countries_id_fk" FOREIGN KEY ("CountryId") REFERENCES "public"."countries"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Payments" ADD CONSTRAINT "Payments_BillingPeriodId_billing_periods_id_fk" FOREIGN KEY ("BillingPeriodId") REFERENCES "public"."billing_periods"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_keys_organization_id_idx" ON "api_keys" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_period_items_billing_period_id_idx" ON "billing_period_items" USING btree ("billing_period_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_period_items_discount_redemption_id_idx" ON "billing_period_items" USING btree ("discount_redemption_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_periods_subscription_id_idx" ON "billing_periods" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_periods_status_idx" ON "billing_periods" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_runs_billing_period_id_idx" ON "billing_runs" USING btree ("billing_period_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_runs_status_idx" ON "billing_runs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "countries_name_unique_idx" ON "countries" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "countries_code_unique_idx" ON "countries" USING btree ("code");--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_id_unique" UNIQUE("id");--> statement-breakpoint
ALTER TABLE "billing_period_items" ADD CONSTRAINT "billing_period_items_id_unique" UNIQUE("id");--> statement-breakpoint
-- ALTER TABLE "billing_periods" ADD CONSTRAINT "billing_periods_id_unique" UNIQUE("id");--> statement-breakpoint
-- ALTER TABLE "countries" ADD CONSTRAINT "countries_id_unique" UNIQUE("id");--> statement-breakpoint
ALTER TABLE "billing_runs" ADD CONSTRAINT "billing_runs_id_unique" UNIQUE("id");--> statement-breakpoint
ALTER TABLE "countries" ADD CONSTRAINT "countries_name_unique" UNIQUE("name");--> statement-breakpoint
ALTER TABLE "countries" ADD CONSTRAINT "countries_code_unique" UNIQUE("code");