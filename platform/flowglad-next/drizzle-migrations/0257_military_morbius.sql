-- Step 1: Add nullable pricing_model_id columns
ALTER TABLE "purchases" ADD COLUMN "pricing_model_id" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "pricing_model_id" text;--> statement-breakpoint
ALTER TABLE "usage_credit_applications" ADD COLUMN "pricing_model_id" text;--> statement-breakpoint
ALTER TABLE "usage_credit_balance_adjustments" ADD COLUMN "pricing_model_id" text;--> statement-breakpoint

-- Step 2: Add foreign key constraints
DO $$ BEGIN
 ALTER TABLE "purchases" ADD CONSTRAINT "purchases_pricing_model_id_pricing_models_id_fk" FOREIGN KEY ("pricing_model_id") REFERENCES "public"."pricing_models"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_pricing_model_id_pricing_models_id_fk" FOREIGN KEY ("pricing_model_id") REFERENCES "public"."pricing_models"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "usage_credit_applications" ADD CONSTRAINT "usage_credit_applications_pricing_model_id_pricing_models_id_fk" FOREIGN KEY ("pricing_model_id") REFERENCES "public"."pricing_models"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "usage_credit_balance_adjustments" ADD CONSTRAINT "usage_credit_balance_adjustments_pricing_model_id_pricing_models_id_fk" FOREIGN KEY ("pricing_model_id") REFERENCES "public"."pricing_models"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- Step 3: Backfill pricing_model_id from parent records
-- subscriptions: derive from price -> product
UPDATE "subscriptions" SET "pricing_model_id" = (SELECT "pricing_model_id" FROM "products" WHERE "products"."id" = (SELECT "product_id" FROM "prices" WHERE "prices"."id" = "subscriptions"."price_id"));--> statement-breakpoint

-- purchases: derive from price -> product
UPDATE "purchases" SET "pricing_model_id" = (SELECT "pricing_model_id" FROM "products" WHERE "products"."id" = (SELECT "product_id" FROM "prices" WHERE "prices"."id" = "purchases"."price_id"));--> statement-breakpoint

-- usage_credit_applications: derive from usageCredit
UPDATE "usage_credit_applications" SET "pricing_model_id" = (SELECT "pricing_model_id" FROM "usage_credits" WHERE "usage_credits"."id" = "usage_credit_applications"."usage_credit_id");--> statement-breakpoint

-- usage_credit_balance_adjustments: derive from usageCredit
UPDATE "usage_credit_balance_adjustments" SET "pricing_model_id" = (SELECT "pricing_model_id" FROM "usage_credits" WHERE "usage_credits"."id" = "usage_credit_balance_adjustments"."adjusted_usage_credit_id");--> statement-breakpoint

-- Step 4: Add NOT NULL constraints after backfill
ALTER TABLE "purchases" ALTER COLUMN "pricing_model_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "pricing_model_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_credit_applications" ALTER COLUMN "pricing_model_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_credit_balance_adjustments" ALTER COLUMN "pricing_model_id" SET NOT NULL;--> statement-breakpoint

-- Step 5: Create indexes for query performance
CREATE INDEX IF NOT EXISTS "purchases_pricing_model_id_idx" ON "purchases" USING btree ("pricing_model_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriptions_pricing_model_id_idx" ON "subscriptions" USING btree ("pricing_model_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_credit_applications_pricing_model_id_idx" ON "usage_credit_applications" USING btree ("pricing_model_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_credit_balance_adjustments_pricing_model_id_idx" ON "usage_credit_balance_adjustments" USING btree ("pricing_model_id");
