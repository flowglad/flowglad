-- Wave 6: Add pricingModelId to fee_calculations
-- Dependencies: billingPeriods and checkoutSessions must already have pricingModelId (from Waves 3 and 5)

-- Step 1: Add nullable pricing_model_id column
ALTER TABLE "fee_calculations" ADD COLUMN "pricing_model_id" text;--> statement-breakpoint

-- Step 2: Add foreign key constraint
DO $$ BEGIN
 ALTER TABLE "fee_calculations" ADD CONSTRAINT "fee_calculations_pricing_model_id_pricing_models_id_fk" FOREIGN KEY ("pricing_model_id") REFERENCES "public"."pricing_models"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- Step 3: Backfill pricing_model_id from parent records
-- Priority: billingPeriodId > checkoutSessionId (as per gameplan)
UPDATE "fee_calculations" SET "pricing_model_id" = COALESCE(
  (SELECT "pricing_model_id" FROM "billing_periods" WHERE "billing_periods"."id" = "fee_calculations"."billing_period_id"),
  (SELECT "pricing_model_id" FROM "checkout_sessions" WHERE "checkout_sessions"."id" = "fee_calculations"."checkout_session_id")
);--> statement-breakpoint

-- Step 4: Add NOT NULL constraint after backfill
ALTER TABLE "fee_calculations" ALTER COLUMN "pricing_model_id" SET NOT NULL;--> statement-breakpoint

-- Step 5: Create index for query performance
CREATE INDEX IF NOT EXISTS "fee_calculations_pricing_model_id_idx" ON "fee_calculations" USING btree ("pricing_model_id");
