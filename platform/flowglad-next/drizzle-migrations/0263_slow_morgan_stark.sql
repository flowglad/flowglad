-- Step 1: Add nullable pricing_model_id columns
ALTER TABLE "checkout_sessions" ADD COLUMN "pricing_model_id" text;--> statement-breakpoint
ALTER TABLE "refunds" ADD COLUMN "pricing_model_id" text;--> statement-breakpoint

-- Step 2: Add foreign key constraints
DO $$ BEGIN
 ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_pricing_model_id_pricing_models_id_fk" FOREIGN KEY ("pricing_model_id") REFERENCES "public"."pricing_models"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "refunds" ADD CONSTRAINT "refunds_pricing_model_id_pricing_models_id_fk" FOREIGN KEY ("pricing_model_id") REFERENCES "public"."pricing_models"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- Step 3: Backfill pricing_model_id from parent records

-- Backfill checkout_sessions:
-- Priority: priceId > purchaseId > invoiceId > customerId (for AddPaymentMethod)
UPDATE "checkout_sessions" 
SET "pricing_model_id" = COALESCE(
  -- Try price first (for Product sessions)
  (SELECT "pricing_model_id" FROM "products" WHERE "products"."id" = (SELECT "product_id" FROM "prices" WHERE "prices"."id" = "checkout_sessions"."price_id")),
  -- Try purchase second (for Purchase sessions)
  (SELECT "pricing_model_id" FROM "purchases" WHERE "purchases"."id" = "checkout_sessions"."purchase_id"),
  -- Try invoice third (for Invoice sessions)
  (SELECT "pricing_model_id" FROM "invoices" WHERE "invoices"."id" = "checkout_sessions"."invoice_id"),
  -- Fall back to customer (for AddPaymentMethod sessions)
  (SELECT "pricing_model_id" FROM "customers" WHERE "customers"."id" = "checkout_sessions"."customer_id" AND "checkout_sessions"."type" = 'add_payment_method')
);
--> statement-breakpoint

-- Backfill refunds from payment
UPDATE "refunds" 
SET "pricing_model_id" = (SELECT "pricing_model_id" FROM "payments" WHERE "payments"."id" = "refunds"."payment_id");
--> statement-breakpoint

-- Step 4: Add NOT NULL constraints after successful backfill
ALTER TABLE "checkout_sessions" ALTER COLUMN "pricing_model_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "refunds" ALTER COLUMN "pricing_model_id" SET NOT NULL;--> statement-breakpoint

-- Step 5: Create indexes for query performance
CREATE INDEX IF NOT EXISTS "checkout_sessions_pricing_model_id_idx" ON "checkout_sessions" USING btree ("pricing_model_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "refunds_pricing_model_id_idx" ON "refunds" USING btree ("pricing_model_id");
