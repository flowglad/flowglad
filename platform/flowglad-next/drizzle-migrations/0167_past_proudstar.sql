ALTER TABLE "purchase_sessions" RENAME TO "checkout_sessions";--> statement-breakpoint
ALTER TABLE "fee_calculations" RENAME COLUMN "purchase_session_id" TO "checkout_session_id";--> statement-breakpoint
ALTER TABLE "checkout_sessions" DROP CONSTRAINT "purchase_sessions_id_unique";--> statement-breakpoint
ALTER TABLE "fee_calculations" DROP CONSTRAINT "fee_calculations_purchase_session_id_purchase_sessions_id_fk";
--> statement-breakpoint
ALTER TABLE "checkout_sessions" DROP CONSTRAINT "purchase_sessions_variant_id_variants_id_fk";
--> statement-breakpoint
ALTER TABLE "checkout_sessions" DROP CONSTRAINT "purchase_sessions_purchase_id_purchases_id_fk";
--> statement-breakpoint
ALTER TABLE "checkout_sessions" DROP CONSTRAINT "purchase_sessions_invoice_id_invoices_id_fk";
--> statement-breakpoint
ALTER TABLE "checkout_sessions" DROP CONSTRAINT "purchase_sessions_organization_id_organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "checkout_sessions" DROP CONSTRAINT "purchase_sessions_customer_profile_id_customer_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "checkout_sessions" DROP CONSTRAINT "purchase_sessions_discount_id_discounts_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "fee_calculations_purchase_session_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "purchase_sessions_variant_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "purchase_sessions_stripe_payment_intent_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "purchase_sessions_organization_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "purchase_sessions_status_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "purchase_sessions_stripe_setup_intent_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "purchase_sessions_purchase_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "purchase_sessions_discount_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "purchase_sessions_customer_profile_id_idx";--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE "PurchaseSessionStatus" RENAME TO "CheckoutSessionStatus";
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TYPE "PurchaseSessionType" RENAME TO "CheckoutSessionType";
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "checkout_sessions" ALTER COLUMN "status" SET DATA TYPE "CheckoutSessionStatus";--> statement-breakpoint
ALTER TABLE "checkout_sessions" ALTER COLUMN "type" SET DATA TYPE "CheckoutSessionType";--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "plan_name" DROP NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fee_calculations" ADD CONSTRAINT "fee_calculations_checkout_session_id_checkout_sessions_id_fk" FOREIGN KEY ("checkout_session_id") REFERENCES "public"."checkout_sessions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_customer_profile_id_customer_profiles_id_fk" FOREIGN KEY ("customer_profile_id") REFERENCES "public"."customer_profiles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_discount_id_discounts_id_fk" FOREIGN KEY ("discount_id") REFERENCES "public"."discounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fee_calculations_checkout_session_id_idx" ON "fee_calculations" USING btree ("checkout_session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "checkout_sessions_variant_id_idx" ON "checkout_sessions" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "checkout_sessions_stripe_payment_intent_id_idx" ON "checkout_sessions" USING btree ("stripe_payment_intent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "checkout_sessions_organization_id_idx" ON "checkout_sessions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "checkout_sessions_status_idx" ON "checkout_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "checkout_sessions_stripe_setup_intent_id_idx" ON "checkout_sessions" USING btree ("stripe_setup_intent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "checkout_sessions_purchase_id_idx" ON "checkout_sessions" USING btree ("purchase_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "checkout_sessions_discount_id_idx" ON "checkout_sessions" USING btree ("discount_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "checkout_sessions_customer_profile_id_idx" ON "checkout_sessions" USING btree ("customer_profile_id");--> statement-breakpoint
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_id_unique" UNIQUE("id");