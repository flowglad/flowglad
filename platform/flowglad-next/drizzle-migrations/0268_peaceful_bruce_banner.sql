-- Pricing Model Customer & Payment Method Migration
-- This migration makes customers and payment methods fully pricing-model-scoped
--
-- STRUCTURE: This migration uses a 3-phase approach for safety:
-- Phase 1: DDL setup (separate statements)
-- Phase 2: All DML in a single transaction (BEGIN/COMMIT block)
-- Phase 3: Final DDL (separate statements)

-- ============================================================================
-- PHASE 1: DDL SETUP (separate statements, can partially fail and be re-run)
-- ============================================================================

-- Step 1: Make customers.pricing_model_id NOT NULL
ALTER TABLE "customers" ALTER COLUMN "pricing_model_id" SET NOT NULL;--> statement-breakpoint

-- Step 2: Drop old unique constraints on customers
DROP INDEX IF EXISTS "customers_organization_id_external_id_livemode_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "customers_organization_id_invoice_number_base_livemode_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "customers_stripe_customer_id_unique_idx";--> statement-breakpoint

-- Step 3: Add payment_methods.pricing_model_id column (nullable for now)
ALTER TABLE "payment_methods" ADD COLUMN IF NOT EXISTS "pricing_model_id" text;--> statement-breakpoint

-- Step 4: Add foreign key for payment_methods.pricing_model_id
DO $$ BEGIN
 ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_pricing_model_id_pricing_models_id_fk" FOREIGN KEY ("pricing_model_id") REFERENCES "public"."pricing_models"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

-- ============================================================================
-- PHASE 2: ALL DML IN A SINGLE TRANSACTION
-- This entire block runs atomically - if any step fails, everything rolls back
-- ============================================================================

-- BEGIN;

-- Step 5: Backfill payment_methods.pricing_model_id from customer
UPDATE "payment_methods" SET "pricing_model_id" = (
  SELECT "pricing_model_id"
  FROM "customers"
  WHERE "customers"."id" = "payment_methods"."customer_id"
)
WHERE "pricing_model_id" IS NULL;

-- Step 6: Clone customers based on cross-pricing-model transactions
-- Create temporary table to track which customers need cloning
CREATE TEMPORARY TABLE customer_pricing_model_combinations AS
SELECT DISTINCT
  c.id as original_customer_id,
  c.organization_id,
  c.email,
  c.name,
  c.invoice_number_base,
  c.archived,
  c.stripe_customer_id,
  c.tax_id,
  c.logo_url,
  c.icon_url,
  c.domain,
  c.billing_address,
  c.external_id,
  c.user_id,
  c.livemode,
  c.created_at,
  c.updated_at,
  c.pricing_model_id as original_pricing_model_id,
  c.stack_auth_hosted_billing_user_id,
  p.pricing_model_id as transaction_pricing_model_id
FROM customers c
INNER JOIN purchases p ON c.id = p.customer_id
WHERE c.pricing_model_id != p.pricing_model_id

UNION

SELECT DISTINCT
  c.id as original_customer_id,
  c.organization_id,
  c.email,
  c.name,
  c.invoice_number_base,
  c.archived,
  c.stripe_customer_id,
  c.tax_id,
  c.logo_url,
  c.icon_url,
  c.domain,
  c.billing_address,
  c.external_id,
  c.user_id,
  c.livemode,
  c.created_at,
  c.updated_at,
  c.pricing_model_id as original_pricing_model_id,
  c.stack_auth_hosted_billing_user_id,
  s.pricing_model_id as transaction_pricing_model_id
FROM customers c
INNER JOIN subscriptions s ON c.id = s.customer_id
WHERE c.pricing_model_id != s.pricing_model_id

UNION

SELECT DISTINCT
  c.id as original_customer_id,
  c.organization_id,
  c.email,
  c.name,
  c.invoice_number_base,
  c.archived,
  c.stripe_customer_id,
  c.tax_id,
  c.logo_url,
  c.icon_url,
  c.domain,
  c.billing_address,
  c.external_id,
  c.user_id,
  c.livemode,
  c.created_at,
  c.updated_at,
  c.pricing_model_id as original_pricing_model_id,
  c.stack_auth_hosted_billing_user_id,
  i.pricing_model_id as transaction_pricing_model_id
FROM customers c
INNER JOIN invoices i ON c.id = i.customer_id
WHERE c.pricing_model_id != i.pricing_model_id;

-- Step 7: Insert cloned customers with new IDs
INSERT INTO customers (
  id, organization_id, email, name, invoice_number_base, archived,
  stripe_customer_id, tax_id, logo_url, icon_url, domain, billing_address,
  external_id, user_id, pricing_model_id, livemode, created_at, updated_at,
  stack_auth_hosted_billing_user_id
)
SELECT
  'cust_' || substr(md5(random()::text || clock_timestamp()::text), 1, 24) as id,
  organization_id,
  email,
  name,
  NULL as invoice_number_base, -- Will be regenerated
  archived,
  stripe_customer_id, -- SHARED across clones
  tax_id,
  logo_url,
  icon_url,
  domain,
  billing_address,
  external_id, -- Keep original externalId (uniqueness ensured by [pricingModelId, externalId] constraint)
  user_id,
  transaction_pricing_model_id as pricing_model_id,
  livemode,
  created_at,
  updated_at,
  stack_auth_hosted_billing_user_id
FROM customer_pricing_model_combinations;

-- Step 8: Create mapping table for old customer ID -> new customer IDs
CREATE TEMPORARY TABLE customer_clone_mapping AS
SELECT
  cpmc.original_customer_id,
  cpmc.transaction_pricing_model_id,
  c.id as new_customer_id
FROM customer_pricing_model_combinations cpmc
JOIN customers c ON
  c.external_id = cpmc.external_id
  AND c.pricing_model_id = cpmc.transaction_pricing_model_id;

-- Step 9: Clone payment methods for cloned customers
INSERT INTO payment_methods (
  id, customer_id, billing_details, type, "default", payment_method_data,
  metadata, stripe_payment_method_id, external_id, livemode, created_at,
  updated_at, pricing_model_id
)
SELECT
  'pm_' || substr(md5(random()::text || clock_timestamp()::text), 1, 24) as id,
  ccm.new_customer_id as customer_id,
  pm.billing_details,
  pm.type,
  pm."default",
  pm.payment_method_data,
  pm.metadata,
  pm.stripe_payment_method_id, -- SHARED across clones
  CASE
    WHEN pm.external_id IS NOT NULL
    THEN pm.external_id || '_pm_' || ccm.transaction_pricing_model_id
    ELSE NULL
  END as external_id,
  pm.livemode,
  pm.created_at,
  pm.updated_at,
  ccm.transaction_pricing_model_id as pricing_model_id
FROM payment_methods pm
JOIN customer_clone_mapping ccm ON pm.customer_id = ccm.original_customer_id;

-- Step 10: Update foreign key references - purchases
UPDATE purchases p
SET customer_id = ccm.new_customer_id
FROM customer_clone_mapping ccm
WHERE p.customer_id = ccm.original_customer_id
  AND p.pricing_model_id = ccm.transaction_pricing_model_id;

-- Step 11: Update foreign key references - subscriptions
UPDATE subscriptions s
SET customer_id = ccm.new_customer_id
FROM customer_clone_mapping ccm
WHERE s.customer_id = ccm.original_customer_id
  AND s.pricing_model_id = ccm.transaction_pricing_model_id;

-- Step 12: Update subscription payment method references
UPDATE subscriptions s
SET default_payment_method_id = (
  SELECT pm_new.id
  FROM payment_methods pm_orig
  JOIN payment_methods pm_new ON
    pm_orig.stripe_payment_method_id = pm_new.stripe_payment_method_id
    AND pm_new.pricing_model_id = s.pricing_model_id
  WHERE pm_orig.id = s.default_payment_method_id
  LIMIT 1
)
WHERE s.default_payment_method_id IS NOT NULL;

UPDATE subscriptions s
SET backup_payment_method_id = (
  SELECT pm_new.id
  FROM payment_methods pm_orig
  JOIN payment_methods pm_new ON
    pm_orig.stripe_payment_method_id = pm_new.stripe_payment_method_id
    AND pm_new.pricing_model_id = s.pricing_model_id
  WHERE pm_orig.id = s.backup_payment_method_id
  LIMIT 1
)
WHERE s.backup_payment_method_id IS NOT NULL;

-- Step 13: Update foreign key references - invoices
UPDATE invoices i
SET customer_id = ccm.new_customer_id
FROM customer_clone_mapping ccm
WHERE i.customer_id = ccm.original_customer_id
  AND i.pricing_model_id = ccm.transaction_pricing_model_id;

-- Step 14: Update foreign key references - payments (customer)
UPDATE payments p
SET customer_id = ccm.new_customer_id
FROM customer_clone_mapping ccm
WHERE p.customer_id = ccm.original_customer_id
  AND p.pricing_model_id = ccm.transaction_pricing_model_id;

-- Step 15: Update foreign key references - payments (payment_method)
UPDATE payments p
SET payment_method_id = (
  SELECT pm_new.id
  FROM payment_methods pm_orig
  JOIN payment_methods pm_new ON
    pm_orig.stripe_payment_method_id = pm_new.stripe_payment_method_id
    AND pm_new.pricing_model_id = p.pricing_model_id
  WHERE pm_orig.id = p.payment_method_id
  LIMIT 1
)
WHERE p.payment_method_id IS NOT NULL;

-- Step 16: Update foreign key references - billing_runs
UPDATE billing_runs br
SET payment_method_id = (
  SELECT pm_new.id
  FROM payment_methods pm_orig
  JOIN payment_methods pm_new ON
    pm_orig.stripe_payment_method_id = pm_new.stripe_payment_method_id
    AND pm_new.pricing_model_id = br.pricing_model_id
  WHERE pm_orig.id = br.payment_method_id
  LIMIT 1
)
WHERE br.payment_method_id IS NOT NULL;

-- Step 17: Update foreign key references - checkout_sessions
UPDATE checkout_sessions cs
SET customer_id = ccm.new_customer_id
FROM customer_clone_mapping ccm
WHERE cs.customer_id = ccm.original_customer_id
  AND cs.pricing_model_id = ccm.transaction_pricing_model_id;

-- Step 18: Update foreign key references - usage_events
UPDATE usage_events ue
SET customer_id = ccm.new_customer_id
FROM customer_clone_mapping ccm, usage_meters um
WHERE ue.usage_meter_id = um.id
  AND ue.customer_id = ccm.original_customer_id
  AND um.pricing_model_id = ccm.transaction_pricing_model_id;

-- ============================================================================
-- VALIDATION CHECKS (before committing the transaction)
-- These will ROLLBACK the entire transaction if any check fails
-- ============================================================================

-- Validate: All payment_methods have pricing_model_id set
DO $$
DECLARE
  null_count INTEGER;
  rec RECORD;
BEGIN
  SELECT COUNT(*) INTO null_count
  FROM payment_methods
  WHERE pricing_model_id IS NULL;

  IF null_count > 0 THEN
    RAISE NOTICE 'Payment methods with NULL pricing_model_id:';
    FOR rec IN
      SELECT id, customer_id, external_id
      FROM payment_methods
      WHERE pricing_model_id IS NULL
      LIMIT 50
    LOOP
      RAISE NOTICE '  pm_id=%, customer_id=%, external_id=%', rec.id, rec.customer_id, rec.external_id;
    END LOOP;
    RAISE EXCEPTION 'Migration validation failed: % payment_methods have NULL pricing_model_id', null_count;
  END IF;
END $$;

-- Validate: All purchases have customers in the same pricing model
DO $$
DECLARE
  mismatch_count INTEGER;
  rec RECORD;
BEGIN
  SELECT COUNT(*) INTO mismatch_count
  FROM purchases p
  JOIN customers c ON p.customer_id = c.id
  WHERE p.pricing_model_id != c.pricing_model_id;

  IF mismatch_count > 0 THEN
    RAISE NOTICE 'Purchases with customer pricing_model_id mismatch:';
    FOR rec IN
      SELECT p.id as purchase_id, p.customer_id, p.pricing_model_id as purchase_pm, c.pricing_model_id as customer_pm, c.external_id
      FROM purchases p
      JOIN customers c ON p.customer_id = c.id
      WHERE p.pricing_model_id != c.pricing_model_id
      LIMIT 50
    LOOP
      RAISE NOTICE '  purchase_id=%, customer_id=%, purchase_pm=%, customer_pm=%, external_id=%', rec.purchase_id, rec.customer_id, rec.purchase_pm, rec.customer_pm, rec.external_id;
    END LOOP;
    RAISE EXCEPTION 'Migration validation failed: % purchases have customer with mismatched pricing_model_id', mismatch_count;
  END IF;
END $$;

-- Validate: All subscriptions have customers in the same pricing model
DO $$
DECLARE
  mismatch_count INTEGER;
  rec RECORD;
BEGIN
  SELECT COUNT(*) INTO mismatch_count
  FROM subscriptions s
  JOIN customers c ON s.customer_id = c.id
  WHERE s.pricing_model_id != c.pricing_model_id;

  IF mismatch_count > 0 THEN
    RAISE NOTICE 'Subscriptions with customer pricing_model_id mismatch:';
    FOR rec IN
      SELECT s.id as subscription_id, s.customer_id, s.pricing_model_id as subscription_pm, c.pricing_model_id as customer_pm, c.external_id
      FROM subscriptions s
      JOIN customers c ON s.customer_id = c.id
      WHERE s.pricing_model_id != c.pricing_model_id
      LIMIT 50
    LOOP
      RAISE NOTICE '  subscription_id=%, customer_id=%, subscription_pm=%, customer_pm=%, external_id=%', rec.subscription_id, rec.customer_id, rec.subscription_pm, rec.customer_pm, rec.external_id;
    END LOOP;
    RAISE EXCEPTION 'Migration validation failed: % subscriptions have customer with mismatched pricing_model_id', mismatch_count;
  END IF;
END $$;

-- Validate: All subscription payment methods are in the same pricing model
DO $$
DECLARE
  mismatch_count INTEGER;
  rec RECORD;
BEGIN
  SELECT COUNT(*) INTO mismatch_count
  FROM subscriptions s
  JOIN payment_methods pm ON s.default_payment_method_id = pm.id
  WHERE s.pricing_model_id != pm.pricing_model_id;

  IF mismatch_count > 0 THEN
    RAISE NOTICE 'Subscriptions with default_payment_method pricing_model_id mismatch:';
    FOR rec IN
      SELECT s.id as subscription_id, s.default_payment_method_id, s.pricing_model_id as subscription_pm, pm.pricing_model_id as pm_pricing_model
      FROM subscriptions s
      JOIN payment_methods pm ON s.default_payment_method_id = pm.id
      WHERE s.pricing_model_id != pm.pricing_model_id
      LIMIT 50
    LOOP
      RAISE NOTICE '  subscription_id=%, pm_id=%, subscription_pm=%, pm_pricing_model=%', rec.subscription_id, rec.default_payment_method_id, rec.subscription_pm, rec.pm_pricing_model;
    END LOOP;
    RAISE EXCEPTION 'Migration validation failed: % subscriptions have default_payment_method with mismatched pricing_model_id', mismatch_count;
  END IF;
END $$;

-- Validate: All payments have payment methods in the same pricing model (where applicable)
DO $$
DECLARE
  mismatch_count INTEGER;
  rec RECORD;
BEGIN
  SELECT COUNT(*) INTO mismatch_count
  FROM payments p
  JOIN payment_methods pm ON p.payment_method_id = pm.id
  WHERE p.pricing_model_id != pm.pricing_model_id;

  IF mismatch_count > 0 THEN
    RAISE NOTICE 'Payments with payment_method pricing_model_id mismatch:';
    FOR rec IN
      SELECT p.id as payment_id, p.payment_method_id, p.pricing_model_id as payment_pm, pm.pricing_model_id as pm_pricing_model
      FROM payments p
      JOIN payment_methods pm ON p.payment_method_id = pm.id
      WHERE p.pricing_model_id != pm.pricing_model_id
      LIMIT 50
    LOOP
      RAISE NOTICE '  payment_id=%, pm_id=%, payment_pm=%, pm_pricing_model=%', rec.payment_id, rec.payment_method_id, rec.payment_pm, rec.pm_pricing_model;
    END LOOP;
    RAISE EXCEPTION 'Migration validation failed: % payments have payment_method with mismatched pricing_model_id', mismatch_count;
  END IF;
END $$;

-- Validate: All invoices have customers in the same pricing model
DO $$
DECLARE
  mismatch_count INTEGER;
  rec RECORD;
BEGIN
  SELECT COUNT(*) INTO mismatch_count
  FROM invoices i
  JOIN customers c ON i.customer_id = c.id
  WHERE i.pricing_model_id != c.pricing_model_id;

  IF mismatch_count > 0 THEN
    RAISE NOTICE 'Invoices with customer pricing_model_id mismatch:';
    FOR rec IN
      SELECT i.id as invoice_id, i.customer_id, i.pricing_model_id as invoice_pm, c.pricing_model_id as customer_pm, c.external_id
      FROM invoices i
      JOIN customers c ON i.customer_id = c.id
      WHERE i.pricing_model_id != c.pricing_model_id
      LIMIT 50
    LOOP
      RAISE NOTICE '  invoice_id=%, customer_id=%, invoice_pm=%, customer_pm=%, external_id=%', rec.invoice_id, rec.customer_id, rec.invoice_pm, rec.customer_pm, rec.external_id;
    END LOOP;
    RAISE EXCEPTION 'Migration validation failed: % invoices have customer with mismatched pricing_model_id', mismatch_count;
  END IF;
END $$;

-- Validate: All checkout_sessions have customers in the same pricing model
DO $$
DECLARE
  mismatch_count INTEGER;
  rec RECORD;
BEGIN
  SELECT COUNT(*) INTO mismatch_count
  FROM checkout_sessions cs
  JOIN customers c ON cs.customer_id = c.id
  WHERE cs.pricing_model_id != c.pricing_model_id;

  IF mismatch_count > 0 THEN
    RAISE NOTICE 'Checkout sessions with customer pricing_model_id mismatch:';
    FOR rec IN
      SELECT cs.id as checkout_session_id, cs.customer_id, cs.pricing_model_id as cs_pm, c.pricing_model_id as customer_pm, c.external_id
      FROM checkout_sessions cs
      JOIN customers c ON cs.customer_id = c.id
      WHERE cs.pricing_model_id != c.pricing_model_id
      LIMIT 50
    LOOP
      RAISE NOTICE '  checkout_session_id=%, customer_id=%, cs_pm=%, customer_pm=%, external_id=%', rec.checkout_session_id, rec.customer_id, rec.cs_pm, rec.customer_pm, rec.external_id;
    END LOOP;
    RAISE EXCEPTION 'Migration validation failed: % checkout_sessions have customer with mismatched pricing_model_id', mismatch_count;
  END IF;
END $$;

-- Validate: All payment_methods have customers in the same pricing model
DO $$
DECLARE
  mismatch_count INTEGER;
  rec RECORD;
BEGIN
  SELECT COUNT(*) INTO mismatch_count
  FROM payment_methods pm
  JOIN customers c ON pm.customer_id = c.id
  WHERE pm.pricing_model_id != c.pricing_model_id;

  IF mismatch_count > 0 THEN
    RAISE NOTICE 'Payment methods with customer pricing_model_id mismatch:';
    FOR rec IN
      SELECT pm.id as pm_id, pm.customer_id, pm.pricing_model_id as pm_pm, c.pricing_model_id as customer_pm, c.external_id, pm.external_id as pm_external_id
      FROM payment_methods pm
      JOIN customers c ON pm.customer_id = c.id
      WHERE pm.pricing_model_id != c.pricing_model_id
      LIMIT 50
    LOOP
      RAISE NOTICE '  pm_id=%, customer_id=%, pm_pm=%, customer_pm=%, customer_external_id=%, pm_external_id=%', rec.pm_id, rec.customer_id, rec.pm_pm, rec.customer_pm, rec.external_id, rec.pm_external_id;
    END LOOP;
    RAISE EXCEPTION 'Migration validation failed: % payment_methods have customer with mismatched pricing_model_id', mismatch_count;
  END IF;
END $$;

-- Validate: All payments have customers in the same pricing model
DO $$
DECLARE
  mismatch_count INTEGER;
  rec RECORD;
BEGIN
  SELECT COUNT(*) INTO mismatch_count
  FROM payments p
  JOIN customers c ON p.customer_id = c.id
  WHERE p.pricing_model_id != c.pricing_model_id;

  IF mismatch_count > 0 THEN
    RAISE NOTICE 'Payments with customer pricing_model_id mismatch:';
    FOR rec IN
      SELECT p.id as payment_id, p.customer_id, p.pricing_model_id as payment_pm, c.pricing_model_id as customer_pm, c.external_id
      FROM payments p
      JOIN customers c ON p.customer_id = c.id
      WHERE p.pricing_model_id != c.pricing_model_id
      LIMIT 50
    LOOP
      RAISE NOTICE '  payment_id=%, customer_id=%, payment_pm=%, customer_pm=%, external_id=%', rec.payment_id, rec.customer_id, rec.payment_pm, rec.customer_pm, rec.external_id;
    END LOOP;
    RAISE EXCEPTION 'Migration validation failed: % payments have customer with mismatched pricing_model_id', mismatch_count;
  END IF;
END $$;

-- Validate: All usage_events have customers in the same pricing model
DO $$
DECLARE
  mismatch_count INTEGER;
  rec RECORD;
BEGIN
  SELECT COUNT(*) INTO mismatch_count
  FROM usage_events ue
  JOIN customers c ON ue.customer_id = c.id
  WHERE ue.pricing_model_id != c.pricing_model_id;

  IF mismatch_count > 0 THEN
    RAISE NOTICE 'Usage events with customer pricing_model_id mismatch:';
    FOR rec IN
      SELECT ue.id as usage_event_id, ue.customer_id, ue.pricing_model_id as ue_pm, c.pricing_model_id as customer_pm, c.external_id
      FROM usage_events ue
      JOIN customers c ON ue.customer_id = c.id
      WHERE ue.pricing_model_id != c.pricing_model_id
      LIMIT 50
    LOOP
      RAISE NOTICE '  usage_event_id=%, customer_id=%, ue_pm=%, customer_pm=%, external_id=%', rec.usage_event_id, rec.customer_id, rec.ue_pm, rec.customer_pm, rec.external_id;
    END LOOP;
    RAISE EXCEPTION 'Migration validation failed: % usage_events have customer with mismatched pricing_model_id', mismatch_count;
  END IF;
END $$;

-- Validate: All billing_runs have payment_methods in the same pricing model
DO $$
DECLARE
  mismatch_count INTEGER;
  rec RECORD;
BEGIN
  SELECT COUNT(*) INTO mismatch_count
  FROM billing_runs br
  JOIN payment_methods pm ON br.payment_method_id = pm.id
  WHERE br.pricing_model_id != pm.pricing_model_id;

  IF mismatch_count > 0 THEN
    RAISE NOTICE 'Billing runs with payment_method pricing_model_id mismatch:';
    FOR rec IN
      SELECT br.id as billing_run_id, br.payment_method_id, br.pricing_model_id as br_pm, pm.pricing_model_id as pm_pm
      FROM billing_runs br
      JOIN payment_methods pm ON br.payment_method_id = pm.id
      WHERE br.pricing_model_id != pm.pricing_model_id
      LIMIT 50
    LOOP
      RAISE NOTICE '  billing_run_id=%, payment_method_id=%, br_pm=%, pm_pm=%', rec.billing_run_id, rec.payment_method_id, rec.br_pm, rec.pm_pm;
    END LOOP;
    RAISE EXCEPTION 'Migration validation failed: % billing_runs have payment_method with mismatched pricing_model_id', mismatch_count;
  END IF;
END $$;

-- Validate: All subscriptions have backup_payment_methods in the same pricing model (where applicable)
DO $$
DECLARE
  mismatch_count INTEGER;
  rec RECORD;
BEGIN
  SELECT COUNT(*) INTO mismatch_count
  FROM subscriptions s
  JOIN payment_methods pm ON s.backup_payment_method_id = pm.id
  WHERE s.pricing_model_id != pm.pricing_model_id;

  IF mismatch_count > 0 THEN
    RAISE NOTICE 'Subscriptions with backup_payment_method pricing_model_id mismatch:';
    FOR rec IN
      SELECT s.id as subscription_id, s.backup_payment_method_id, s.pricing_model_id as subscription_pm, pm.pricing_model_id as pm_pm
      FROM subscriptions s
      JOIN payment_methods pm ON s.backup_payment_method_id = pm.id
      WHERE s.pricing_model_id != pm.pricing_model_id
      LIMIT 50
    LOOP
      RAISE NOTICE '  subscription_id=%, backup_pm_id=%, subscription_pm=%, pm_pm=%', rec.subscription_id, rec.backup_payment_method_id, rec.subscription_pm, rec.pm_pm;
    END LOOP;
    RAISE EXCEPTION 'Migration validation failed: % subscriptions have backup_payment_method with mismatched pricing_model_id', mismatch_count;
  END IF;
END $$;

-- Cleanup temporary tables (inside transaction so they're cleaned up on rollback too)
DROP TABLE IF EXISTS customer_pricing_model_combinations;
DROP TABLE IF EXISTS customer_clone_mapping;

-- COMMIT;--> statement-breakpoint

-- ============================================================================
-- PHASE 3: FINAL DDL (separate statements)
-- ============================================================================

-- Step 19: Set payment_methods.pricing_model_id to NOT NULL
ALTER TABLE "payment_methods" ALTER COLUMN "pricing_model_id" SET NOT NULL;--> statement-breakpoint

-- Step 20: Drop old unique constraint on payment_methods
DROP INDEX IF EXISTS "payment_methods_external_id_unique_idx";--> statement-breakpoint

-- Step 21: Create new unique constraints on customers
CREATE UNIQUE INDEX IF NOT EXISTS "customers_pricing_model_id_external_id_unique_idx" ON "customers" USING btree ("pricing_model_id", "external_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "customers_pricing_model_id_invoice_number_base_unique_idx" ON "customers" USING btree ("pricing_model_id", "invoice_number_base");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "customers_stripe_customer_id_pricing_model_id_unique_idx" ON "customers" USING btree ("stripe_customer_id", "pricing_model_id");--> statement-breakpoint

-- Step 22: Create new unique constraint on payment_methods
CREATE UNIQUE INDEX IF NOT EXISTS "payment_methods_external_id_pricing_model_id_unique_idx" ON "payment_methods" USING btree ("external_id", "pricing_model_id");--> statement-breakpoint

-- Step 23: Create index on payment_methods.pricing_model_id
CREATE INDEX IF NOT EXISTS "payment_methods_pricing_model_id_idx" ON "payment_methods" USING btree ("pricing_model_id");
