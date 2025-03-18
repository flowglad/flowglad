ALTER TABLE "customer_profiles" RENAME TO "customers";--> statement-breakpoint
ALTER TABLE "checkout_sessions" RENAME COLUMN "customer_profile_id" TO "customer_id";--> statement-breakpoint
ALTER TABLE "invoices" RENAME COLUMN "customer_profile_id" TO "customer_id";--> statement-breakpoint
ALTER TABLE "messages" RENAME COLUMN "customer_profile_id" TO "customer_id";--> statement-breakpoint
ALTER TABLE "payment_methods" RENAME COLUMN "customer_profile_id" TO "customer_id";--> statement-breakpoint
ALTER TABLE "payments" RENAME COLUMN "customer_profile_id" TO "customer_id";--> statement-breakpoint
ALTER TABLE "purchases" RENAME COLUMN "customer_profile_id" TO "customer_id";--> statement-breakpoint
ALTER TABLE "subscriptions" RENAME COLUMN "customer_profile_id" TO "customer_id";--> statement-breakpoint
ALTER TABLE "customers" DROP CONSTRAINT "customer_profiles_id_unique";--> statement-breakpoint
ALTER TABLE "checkout_sessions" DROP CONSTRAINT "checkout_sessions_customer_profile_id_customer_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "customers" DROP CONSTRAINT "customer_profiles_organization_id_organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "customers" DROP CONSTRAINT "customer_profiles_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_customer_profile_id_customer_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "messages" DROP CONSTRAINT "messages_customer_profile_id_customer_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "payment_methods" DROP CONSTRAINT "payment_methods_customer_profile_id_customer_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT "payments_customer_profile_id_customer_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "purchases" DROP CONSTRAINT "purchases_customer_profile_id_customer_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_customer_profile_id_customer_profiles_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "checkout_sessions_customer_profile_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "customer_profiles_organization_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "customer_profiles_email_organization_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "customer_profiles_user_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "customer_profiles_organization_id_email_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "customer_profiles_organization_id_external_id_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "customer_profiles_organization_id_invoice_number_base_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "customer_profiles_stripe_customer_id_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "customer_profiles_slack_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "invoices_customer_profile_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "payment_methods_customer_profile_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "payments_customer_profile_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "purchases_customer_profile_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "subscriptions_customer_profile_id_idx";--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customers" ADD CONSTRAINT "customers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customers" ADD CONSTRAINT "customers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchases" ADD CONSTRAINT "purchases_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "checkout_sessions_customer_id_idx" ON "checkout_sessions" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customers_organization_id_idx" ON "customers" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customers_email_organization_id_idx" ON "customers" USING btree ("email","organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customers_user_id_idx" ON "customers" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "customers_organization_id_email_unique_idx" ON "customers" USING btree ("organization_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "customers_organization_id_external_id_unique_idx" ON "customers" USING btree ("organization_id","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "customers_organization_id_invoice_number_base_unique_idx" ON "customers" USING btree ("organization_id","invoice_number_base");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "customers_stripe_customer_id_unique_idx" ON "customers" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customers_slack_id_idx" ON "customers" USING btree ("slack_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_customer_id_idx" ON "invoices" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_methods_customer_id_idx" ON "payment_methods" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_customer_id_idx" ON "payments" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchases_customer_id_idx" ON "purchases" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriptions_customer_id_idx" ON "subscriptions" USING btree ("customer_id");--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_id_unique" UNIQUE("id");--> statement-breakpoint
ALTER POLICY "Enable read for own organizations via customer profiles" ON "payment_methods" RENAME TO "Enable read for own organizations via customer";--> statement-breakpoint
ALTER POLICY "Enable actions for own organizations via customer profiles" ON "subscriptions" RENAME TO "Enable actions for own organizations via customer";