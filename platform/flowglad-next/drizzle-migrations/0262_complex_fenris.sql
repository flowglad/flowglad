-- Step 1: Add nullable pricing_model_id columns
ALTER TABLE "billing_period_items" ADD COLUMN "pricing_model_id" text;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD COLUMN "pricing_model_id" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "pricing_model_id" text;--> statement-breakpoint
ALTER TABLE "subscription_item_features" ADD COLUMN "pricing_model_id" text;--> statement-breakpoint

-- Step 2: Add foreign key constraints
DO $$ BEGIN
 ALTER TABLE "billing_period_items" ADD CONSTRAINT "billing_period_items_pricing_model_id_pricing_models_id_fk" FOREIGN KEY ("pricing_model_id") REFERENCES "public"."pricing_models"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_pricing_model_id_pricing_models_id_fk" FOREIGN KEY ("pricing_model_id") REFERENCES "public"."pricing_models"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_pricing_model_id_pricing_models_id_fk" FOREIGN KEY ("pricing_model_id") REFERENCES "public"."pricing_models"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscription_item_features" ADD CONSTRAINT "subscription_item_features_pricing_model_id_pricing_models_id_fk" FOREIGN KEY ("pricing_model_id") REFERENCES "public"."pricing_models"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- Step 3: Backfill pricing_model_id from parent records
-- billingPeriodItems: derive from billingPeriod -> subscription
UPDATE "billing_period_items" SET "pricing_model_id" = (SELECT "pricing_model_id" FROM "billing_periods" WHERE "billing_periods"."id" = "billing_period_items"."billing_period_id");
--> statement-breakpoint

-- invoiceLineItems: derive from invoice (COALESCE) OR price -> product
UPDATE "invoice_line_items" SET "pricing_model_id" = COALESCE(
  (SELECT "pricing_model_id" FROM "invoices" WHERE "invoices"."id" = "invoice_line_items"."invoice_id"),
  (SELECT "pricing_model_id" FROM "products" WHERE "products"."id" = (SELECT "product_id" FROM "prices" WHERE "prices"."id" = "invoice_line_items"."price_id"))
);
--> statement-breakpoint

-- payments: derive from subscription (COALESCE) OR purchase OR invoice
UPDATE "payments" SET "pricing_model_id" = COALESCE(
  (SELECT "pricing_model_id" FROM "subscriptions" WHERE "subscriptions"."id" = "payments"."subscription_id"),
  (SELECT "pricing_model_id" FROM "purchases" WHERE "purchases"."id" = "payments"."purchase_id"),
  (SELECT "pricing_model_id" FROM "invoices" WHERE "invoices"."id" = "payments"."invoice_id")
);
--> statement-breakpoint

-- subscriptionItemFeatures: derive from subscriptionItem -> subscription
UPDATE "subscription_item_features" SET "pricing_model_id" = (SELECT "pricing_model_id" FROM "subscription_items" WHERE "subscription_items"."id" = "subscription_item_features"."subscription_item_id");
--> statement-breakpoint

-- Step 4: Add NOT NULL constraints after backfill
ALTER TABLE "billing_period_items" ALTER COLUMN "pricing_model_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ALTER COLUMN "pricing_model_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "pricing_model_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_item_features" ALTER COLUMN "pricing_model_id" SET NOT NULL;--> statement-breakpoint

-- Step 5: Create indexes for query performance
CREATE INDEX IF NOT EXISTS "billing_period_items_pricing_model_id_idx" ON "billing_period_items" USING btree ("pricing_model_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_line_items_pricing_model_id_idx" ON "invoice_line_items" USING btree ("pricing_model_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_pricing_model_id_idx" ON "payments" USING btree ("pricing_model_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscription_item_features_pricing_model_id_idx" ON "subscription_item_features" USING btree ("pricing_model_id");
