ALTER TABLE "Customers" RENAME TO "customers";--> statement-breakpoint
ALTER TABLE "Files" RENAME TO "files";--> statement-breakpoint
ALTER TABLE "Products" RENAME TO "products";--> statement-breakpoint
ALTER TABLE "PurchaseAccessSessions" RENAME TO "purchase_access_sessions";--> statement-breakpoint
ALTER TABLE "PurchaseSessions" RENAME TO "purchase_sessions";--> statement-breakpoint
ALTER TABLE "customers" RENAME COLUMN "stack_auth_id" TO "stack_auth_user_id";--> statement-breakpoint
ALTER TABLE "customers" DROP CONSTRAINT IF EXISTS "Customers_id_unique";--> statement-breakpoint
ALTER TABLE "customers" DROP CONSTRAINT IF EXISTS "Customers_email_unique";--> statement-breakpoint
ALTER TABLE "files" DROP CONSTRAINT IF EXISTS "Files_id_unique";--> statement-breakpoint
ALTER TABLE "files" DROP CONSTRAINT IF EXISTS "Files_object_key_unique";--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "Products_id_unique";--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "Products_stripe_product_id_unique";--> statement-breakpoint
ALTER TABLE "purchase_access_sessions" DROP CONSTRAINT IF EXISTS "PurchaseAccessSessions_id_unique";--> statement-breakpoint
ALTER TABLE "purchase_sessions" DROP CONSTRAINT IF EXISTS "PurchaseSessions_id_unique";--> statement-breakpoint
ALTER TABLE "customer_profiles" DROP CONSTRAINT IF EXISTS "customer_profiles_customer_id_Customers_id_fk";
--> statement-breakpoint
ALTER TABLE "customers" DROP CONSTRAINT IF EXISTS "Customers_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "fee_calculations" DROP CONSTRAINT IF EXISTS "fee_calculations_purchase_session_id_PurchaseSessions_id_fk";
--> statement-breakpoint
ALTER TABLE "files" DROP CONSTRAINT IF EXISTS "Files_organization_id_organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "files" DROP CONSTRAINT IF EXISTS "Files_product_id_Products_id_fk";
--> statement-breakpoint
ALTER TABLE "links" DROP CONSTRAINT IF EXISTS "links_product_id_Products_id_fk";
--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "Products_organization_id_organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "purchase_access_sessions" DROP CONSTRAINT IF EXISTS "PurchaseAccessSessions_purchase_id_purchases_id_fk";
--> statement-breakpoint
ALTER TABLE "purchase_sessions" DROP CONSTRAINT IF EXISTS "PurchaseSessions_variant_id_variants_id_fk";
--> statement-breakpoint
ALTER TABLE "purchase_sessions" DROP CONSTRAINT IF EXISTS "PurchaseSessions_purchase_id_purchases_id_fk";
--> statement-breakpoint
ALTER TABLE "purchase_sessions" DROP CONSTRAINT IF EXISTS "PurchaseSessions_invoice_id_invoices_id_fk";
--> statement-breakpoint
ALTER TABLE "purchase_sessions" DROP CONSTRAINT IF EXISTS "PurchaseSessions_organization_id_organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "purchase_sessions" DROP CONSTRAINT IF EXISTS "PurchaseSessions_customer_profile_id_customer_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "purchase_sessions" DROP CONSTRAINT IF EXISTS "PurchaseSessions_discount_id_discounts_id_fk";
--> statement-breakpoint
ALTER TABLE "variants" DROP CONSTRAINT IF EXISTS "variants_product_id_Products_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "Customers_user_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Customers_email_livemode_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Files_organization_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Files_object_key_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Products_organization_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Products_active_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Products_stripe_product_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "PurchaseAccessSessions_purchase_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "PurchaseAccessSessions_token_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "PurchaseSessions_variant_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "PurchaseSessions_stripe_payment_intent_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "PurchaseSessions_organization_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "PurchaseSessions_status_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "PurchaseSessions_stripe_setup_intent_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "PurchaseSessions_purchase_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "PurchaseSessions_discount_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "PurchaseSessions_customer_profile_id_idx";--> statement-breakpoint

UPDATE "memberships" m
SET "stack_auth_user_id" = u."stack_auth_id"
FROM "users" u
WHERE m."user_id" = u."id";

UPDATE "customers" c
SET "stack_auth_user_id" = u."stack_auth_id"
FROM "users" u
WHERE c."user_id" = u."id";

ALTER TABLE "memberships" ALTER COLUMN "stack_auth_user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "stack_auth_id" SET NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
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
 ALTER TABLE "fee_calculations" ADD CONSTRAINT "fee_calculations_purchase_session_id_purchase_sessions_id_fk" FOREIGN KEY ("purchase_session_id") REFERENCES "public"."purchase_sessions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "files" ADD CONSTRAINT "files_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "files" ADD CONSTRAINT "files_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "links" ADD CONSTRAINT "links_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "products" ADD CONSTRAINT "products_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_access_sessions" ADD CONSTRAINT "purchase_access_sessions_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_sessions" ADD CONSTRAINT "purchase_sessions_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_sessions" ADD CONSTRAINT "purchase_sessions_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_sessions" ADD CONSTRAINT "purchase_sessions_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_sessions" ADD CONSTRAINT "purchase_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_sessions" ADD CONSTRAINT "purchase_sessions_customer_profile_id_customer_profiles_id_fk" FOREIGN KEY ("customer_profile_id") REFERENCES "public"."customer_profiles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_sessions" ADD CONSTRAINT "purchase_sessions_discount_id_discounts_id_fk" FOREIGN KEY ("discount_id") REFERENCES "public"."discounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "variants" ADD CONSTRAINT "variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customers_user_id_idx" ON "customers" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "customers_email_livemode_unique_idx" ON "customers" USING btree ("email","livemode");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "files_organization_id_idx" ON "files" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "files_object_key_unique_idx" ON "files" USING btree ("object_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_organization_id_idx" ON "products" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_active_idx" ON "products" USING btree ("active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_stripe_product_id_idx" ON "products" USING btree ("stripe_product_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_access_sessions_purchase_id_idx" ON "purchase_access_sessions" USING btree ("purchase_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "purchase_access_sessions_token_unique_idx" ON "purchase_access_sessions" USING btree ("token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_sessions_variant_id_idx" ON "purchase_sessions" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_sessions_stripe_payment_intent_id_idx" ON "purchase_sessions" USING btree ("stripe_payment_intent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_sessions_organization_id_idx" ON "purchase_sessions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_sessions_status_idx" ON "purchase_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_sessions_stripe_setup_intent_id_idx" ON "purchase_sessions" USING btree ("stripe_setup_intent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_sessions_purchase_id_idx" ON "purchase_sessions" USING btree ("purchase_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_sessions_discount_id_idx" ON "purchase_sessions" USING btree ("discount_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_sessions_customer_profile_id_idx" ON "purchase_sessions" USING btree ("customer_profile_id");--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_id_unique" UNIQUE("id");--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_email_unique" UNIQUE("email");--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_id_unique" UNIQUE("id");--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_object_key_unique" UNIQUE("object_key");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_id_unique" UNIQUE("id");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_stripe_product_id_unique" UNIQUE("stripe_product_id");--> statement-breakpoint
ALTER TABLE "purchase_access_sessions" ADD CONSTRAINT "purchase_access_sessions_id_unique" UNIQUE("id");--> statement-breakpoint
ALTER TABLE "purchase_sessions" ADD CONSTRAINT "purchase_sessions_id_unique" UNIQUE("id");