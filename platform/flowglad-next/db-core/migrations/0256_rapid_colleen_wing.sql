-- Step 1: Add nullable pricing_model_id columns
ALTER TABLE "ledger_accounts" ADD COLUMN "pricing_model_id" text;--> statement-breakpoint
ALTER TABLE "prices" ADD COLUMN "pricing_model_id" text;--> statement-breakpoint
ALTER TABLE "product_features" ADD COLUMN "pricing_model_id" text;--> statement-breakpoint
ALTER TABLE "subscription_meter_period_calculations" ADD COLUMN "pricing_model_id" text;--> statement-breakpoint
ALTER TABLE "usage_credits" ADD COLUMN "pricing_model_id" text;--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "pricing_model_id" text;--> statement-breakpoint

-- Step 2: Add foreign key constraints
DO $$ BEGIN
 ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_pricing_model_id_pricing_models_id_fk" FOREIGN KEY ("pricing_model_id") REFERENCES "public"."pricing_models"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "prices" ADD CONSTRAINT "prices_pricing_model_id_pricing_models_id_fk" FOREIGN KEY ("pricing_model_id") REFERENCES "public"."pricing_models"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_features" ADD CONSTRAINT "product_features_pricing_model_id_pricing_models_id_fk" FOREIGN KEY ("pricing_model_id") REFERENCES "public"."pricing_models"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscription_meter_period_calculations" ADD CONSTRAINT "subscription_meter_period_calculations_pricing_model_id_pricing_models_id_fk" FOREIGN KEY ("pricing_model_id") REFERENCES "public"."pricing_models"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "usage_credits" ADD CONSTRAINT "usage_credits_pricing_model_id_pricing_models_id_fk" FOREIGN KEY ("pricing_model_id") REFERENCES "public"."pricing_models"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_pricing_model_id_pricing_models_id_fk" FOREIGN KEY ("pricing_model_id") REFERENCES "public"."pricing_models"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- Step 3: Backfill pricing_model_id from parent records
-- prices: derive from product.pricingModelId
UPDATE "prices" SET "pricing_model_id" = (SELECT "pricing_model_id" FROM "products" WHERE "products"."id" = "prices"."product_id");--> statement-breakpoint

-- product_features: derive from product.pricingModelId
UPDATE "product_features" SET "pricing_model_id" = (SELECT "pricing_model_id" FROM "products" WHERE "products"."id" = "product_features"."product_id");--> statement-breakpoint

-- usage_events: derive from usageMeter.pricingModelId
UPDATE "usage_events" SET "pricing_model_id" = (SELECT "pricing_model_id" FROM "usage_meters" WHERE "usage_meters"."id" = "usage_events"."usage_meter_id");--> statement-breakpoint

-- usage_credits: derive from usageMeter.pricingModelId
UPDATE "usage_credits" SET "pricing_model_id" = (SELECT "pricing_model_id" FROM "usage_meters" WHERE "usage_meters"."id" = "usage_credits"."usage_meter_id");--> statement-breakpoint

-- ledger_accounts: derive from usageMeter.pricingModelId
UPDATE "ledger_accounts" SET "pricing_model_id" = (SELECT "pricing_model_id" FROM "usage_meters" WHERE "usage_meters"."id" = "ledger_accounts"."usage_meter_id");--> statement-breakpoint

-- subscription_meter_period_calculations: derive from usageMeter.pricingModelId
UPDATE "subscription_meter_period_calculations" SET "pricing_model_id" = (SELECT "pricing_model_id" FROM "usage_meters" WHERE "usage_meters"."id" = "subscription_meter_period_calculations"."usage_meter_id");--> statement-breakpoint

-- Step 4: Add NOT NULL constraints after backfill
ALTER TABLE "ledger_accounts" ALTER COLUMN "pricing_model_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "prices" ALTER COLUMN "pricing_model_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "product_features" ALTER COLUMN "pricing_model_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_meter_period_calculations" ALTER COLUMN "pricing_model_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_credits" ALTER COLUMN "pricing_model_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_events" ALTER COLUMN "pricing_model_id" SET NOT NULL;--> statement-breakpoint

-- Step 5: Create indexes for query performance
CREATE INDEX IF NOT EXISTS "ledger_accounts_pricing_model_id_idx" ON "ledger_accounts" USING btree ("pricing_model_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prices_pricing_model_id_idx" ON "prices" USING btree ("pricing_model_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_features_pricing_model_id_idx" ON "product_features" USING btree ("pricing_model_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscription_meter_period_calculations_pricing_model_id_idx" ON "subscription_meter_period_calculations" USING btree ("pricing_model_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_credits_pricing_model_id_idx" ON "usage_credits" USING btree ("pricing_model_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_events_pricing_model_id_idx" ON "usage_events" USING btree ("pricing_model_id");