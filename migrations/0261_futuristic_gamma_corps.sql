-- Step 1: Add nullable pricing_model_id columns
ALTER TABLE "billing_periods" ADD COLUMN "pricing_model_id" text;--> statement-breakpoint
ALTER TABLE "billing_runs" ADD COLUMN "pricing_model_id" text;--> statement-breakpoint
ALTER TABLE "discount_redemptions" ADD COLUMN "pricing_model_id" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "pricing_model_id" text;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "pricing_model_id" text;--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD COLUMN "pricing_model_id" text;--> statement-breakpoint
ALTER TABLE "subscription_items" ADD COLUMN "pricing_model_id" text;--> statement-breakpoint

-- Step 2: Add foreign key constraints
DO $$ BEGIN
 ALTER TABLE "billing_periods" ADD CONSTRAINT "billing_periods_pricing_model_id_pricing_models_id_fk" FOREIGN KEY ("pricing_model_id") REFERENCES "public"."pricing_models"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "billing_runs" ADD CONSTRAINT "billing_runs_pricing_model_id_pricing_models_id_fk" FOREIGN KEY ("pricing_model_id") REFERENCES "public"."pricing_models"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "discount_redemptions" ADD CONSTRAINT "discount_redemptions_pricing_model_id_pricing_models_id_fk" FOREIGN KEY ("pricing_model_id") REFERENCES "public"."pricing_models"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_pricing_model_id_pricing_models_id_fk" FOREIGN KEY ("pricing_model_id") REFERENCES "public"."pricing_models"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_pricing_model_id_pricing_models_id_fk" FOREIGN KEY ("pricing_model_id") REFERENCES "public"."pricing_models"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_pricing_model_id_pricing_models_id_fk" FOREIGN KEY ("pricing_model_id") REFERENCES "public"."pricing_models"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscription_items" ADD CONSTRAINT "subscription_items_pricing_model_id_pricing_models_id_fk" FOREIGN KEY ("pricing_model_id") REFERENCES "public"."pricing_models"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- Step 3: Backfill pricing_model_id from parent records
-- billingPeriods: derive from subscription
UPDATE "billing_periods" SET "pricing_model_id" = (SELECT "pricing_model_id" FROM "subscriptions" WHERE "subscriptions"."id" = "billing_periods"."subscription_id");
--> statement-breakpoint
-- billingRuns: derive from subscription
UPDATE "billing_runs" SET "pricing_model_id" = (SELECT "pricing_model_id" FROM "subscriptions" WHERE "subscriptions"."id" = "billing_runs"."subscription_id");
--> statement-breakpoint
-- subscriptionItems: derive from subscription
UPDATE "subscription_items" SET "pricing_model_id" = (SELECT "pricing_model_id" FROM "subscriptions" WHERE "subscriptions"."id" = "subscription_items"."subscription_id");
--> statement-breakpoint
-- ledgerTransactions: derive from subscription
UPDATE "ledger_transactions" SET "pricing_model_id" = (SELECT "pricing_model_id" FROM "subscriptions" WHERE "subscriptions"."id" = "ledger_transactions"."subscription_id");
--> statement-breakpoint
-- discountRedemptions: derive from purchase
UPDATE "discount_redemptions" SET "pricing_model_id" = (SELECT "pricing_model_id" FROM "purchases" WHERE "purchases"."id" = "discount_redemptions"."purchase_id");
--> statement-breakpoint
-- invoices: COALESCE(subscription, purchase, customer)
UPDATE "invoices" SET "pricing_model_id" = COALESCE(
  (SELECT "pricing_model_id" FROM "subscriptions" WHERE "subscriptions"."id" = "invoices"."subscription_id"),
  (SELECT "pricing_model_id" FROM "purchases" WHERE "purchases"."id" = "invoices"."purchase_id"),
  (SELECT "pricing_model_id" FROM "customers" WHERE "customers"."id" = "invoices"."customer_id")
);
--> statement-breakpoint
-- ledgerEntries: COALESCE(subscription, usageMeter)
UPDATE "ledger_entries" SET "pricing_model_id" = COALESCE(
  (SELECT "pricing_model_id" FROM "subscriptions" WHERE "subscriptions"."id" = "ledger_entries"."subscription_id"),
  (SELECT "pricing_model_id" FROM "usage_meters" WHERE "usage_meters"."id" = "ledger_entries"."usage_meter_id")
);
--> statement-breakpoint

-- Step 4: Add NOT NULL constraints after backfill
ALTER TABLE "billing_periods" ALTER COLUMN "pricing_model_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_runs" ALTER COLUMN "pricing_model_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_items" ALTER COLUMN "pricing_model_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ledger_transactions" ALTER COLUMN "pricing_model_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "discount_redemptions" ALTER COLUMN "pricing_model_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "pricing_model_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ledger_entries" ALTER COLUMN "pricing_model_id" SET NOT NULL;--> statement-breakpoint

-- Step 5: Create indexes for query performance
CREATE INDEX IF NOT EXISTS "billing_periods_pricing_model_id_idx" ON "billing_periods" USING btree ("pricing_model_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_runs_pricing_model_id_idx" ON "billing_runs" USING btree ("pricing_model_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discount_redemptions_pricing_model_id_idx" ON "discount_redemptions" USING btree ("pricing_model_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_pricing_model_id_idx" ON "invoices" USING btree ("pricing_model_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_entries_pricing_model_id_idx" ON "ledger_entries" USING btree ("pricing_model_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_transactions_pricing_model_id_idx" ON "ledger_transactions" USING btree ("pricing_model_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscription_items_pricing_model_id_idx" ON "subscription_items" USING btree ("pricing_model_id");