-- Step 1: Add nullable pricing_model_id column
ALTER TABLE "discounts" ADD COLUMN "pricing_model_id" text;
--> statement-breakpoint

-- Step 2: Add foreign key constraint (consistent with other pricing_model_id FKs)
DO $$ BEGIN
 ALTER TABLE "discounts" ADD CONSTRAINT "discounts_pricing_model_id_pricing_models_id_fk"
   FOREIGN KEY ("pricing_model_id") REFERENCES "public"."pricing_models"("id")
   ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- Step 2b: Drop old unique constraint before cloning
-- This must happen before Step 3 because cloning creates multiple discounts
-- with the same code/organization/livemode (differentiated by pricing_model_id)
DROP INDEX IF EXISTS "discounts_code_organization_id_livemode_unique_idx";
--> statement-breakpoint

-- Step 3: Migrate existing discounts by cloning per pricing model
DO $$
DECLARE
  discount_rec RECORD;
  pm_id_rec RECORD;
  first_pm_id text;
  new_discount_id text;
BEGIN
  -- For each discount
  FOR discount_rec IN SELECT * FROM discounts LOOP
    -- Get all unique pricing model IDs from redemptions of this discount
    first_pm_id := NULL;

    FOR pm_id_rec IN
      SELECT DISTINCT pricing_model_id
      FROM discount_redemptions
      WHERE discount_id = discount_rec.id
      ORDER BY pricing_model_id
    LOOP
      IF first_pm_id IS NULL THEN
        -- First pricing model: update the original discount
        first_pm_id := pm_id_rec.pricing_model_id;
        UPDATE discounts
        SET pricing_model_id = first_pm_id
        WHERE id = discount_rec.id;
      ELSE
        -- Subsequent pricing models: clone the discount
        new_discount_id := 'discount_' || gen_random_uuid()::text;

        INSERT INTO discounts (
          id, organization_id, name, code, amount, amount_type,
          active, duration, number_of_payments, livemode,
          created_at, updated_at, pricing_model_id
        ) VALUES (
          new_discount_id,
          discount_rec.organization_id,
          discount_rec.name,
          discount_rec.code,
          discount_rec.amount,
          discount_rec.amount_type,
          discount_rec.active,
          discount_rec.duration,
          discount_rec.number_of_payments,
          discount_rec.livemode,
          discount_rec.created_at,
          NOW(),
          pm_id_rec.pricing_model_id
        );

        -- Update discount_redemptions to point to cloned discount
        UPDATE discount_redemptions
        SET discount_id = new_discount_id
        WHERE discount_id = discount_rec.id
          AND pricing_model_id = pm_id_rec.pricing_model_id;
      END IF;
    END LOOP;

    -- Handle discounts with no redemptions: assign to org's default pricing model
    IF first_pm_id IS NULL THEN
      UPDATE discounts d
      SET pricing_model_id = (
        SELECT pm.id
        FROM pricing_models pm
        WHERE pm.organization_id = d.organization_id
          AND pm.livemode = d.livemode
          AND pm.is_default = true
        LIMIT 1
      )
      WHERE d.id = discount_rec.id;
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint

-- Step 3b: Update checkout_sessions to point to correct pricing-model-scoped discount
--
-- Why JOIN-based instead of subquery-based UPDATE?
-- A subquery like `SET discount_id = (SELECT ... LIMIT 1)` returns NULL if no match is found,
-- which would accidentally clear the discount_id. The JOIN-based approach only updates rows
-- where a matching discount actually exists, preserving the original discount_id otherwise.
--
-- Example scenario this handles safely:
--   1. Discount "SAVE20" (id=D1) existed org-wide, had redemptions only in Pricing Model A
--   2. Step 3 assigned D1 to Pricing Model A (since that's where redemptions occurred)
--   3. Checkout session CS1 references D1 but has pricing_model_id = Pricing Model B
--   4. No discount with code "SAVE20" exists for Pricing Model B
--   5. With subquery approach: CS1.discount_id would become NULL (data loss!)
--   6. With JOIN approach: CS1 is not updated, keeps original D1 reference
--   7. The validation in Step 3e will flag this as a pricing_model_id mismatch for review
--
UPDATE checkout_sessions cs
SET discount_id = sub.new_discount_id
FROM (
  SELECT cs2.id as cs_id, d2.id as new_discount_id
  FROM checkout_sessions cs2
  JOIN discounts d_old ON cs2.discount_id = d_old.id
  JOIN discounts d2 ON d2.code = d_old.code
    AND d2.pricing_model_id = cs2.pricing_model_id
    AND d2.organization_id = cs2.organization_id
    AND d2.livemode = d_old.livemode
) sub
WHERE cs.id = sub.cs_id;
--> statement-breakpoint

-- Step 3c: Update fee_calculations to point to correct pricing-model-scoped discount
--
-- Same JOIN-based approach as checkout_sessions above - only updates rows where a matching
-- pricing-model-scoped discount exists. If no match is found, the original discount_id is
-- preserved and the validation in Step 3e will flag the mismatch.
--
UPDATE fee_calculations fc
SET discount_id = sub.new_discount_id
FROM (
  SELECT fc2.id as fc_id, d2.id as new_discount_id
  FROM fee_calculations fc2
  JOIN discounts d_old ON fc2.discount_id = d_old.id
  JOIN discounts d2 ON d2.code = d_old.code
    AND d2.pricing_model_id = fc2.pricing_model_id
    AND d2.organization_id = fc2.organization_id
    AND d2.livemode = d_old.livemode
) sub
WHERE fc.id = sub.fc_id;
--> statement-breakpoint

-- Step 3d: Verify no NULL pricing_model_ids remain (fail explicitly if any orgs lack default PM)
DO $$
DECLARE
  null_count INTEGER;
  rec RECORD;
BEGIN
  SELECT COUNT(*) INTO null_count FROM discounts WHERE pricing_model_id IS NULL;
  IF null_count > 0 THEN
    RAISE NOTICE 'Discounts missing pricing_model_id (organization lacks default pricing model):';
    FOR rec IN
      SELECT d.id as discount_id, d.code, d.organization_id, d.livemode, o.name as org_name
      FROM discounts d
      LEFT JOIN organizations o ON d.organization_id = o.id
      WHERE d.pricing_model_id IS NULL
      LIMIT 50
    LOOP
      RAISE NOTICE '  discount_id=%, code=%, organization_id=%, org_name=%, livemode=%',
        rec.discount_id, rec.code, rec.organization_id, rec.org_name, rec.livemode;
    END LOOP;
    RAISE EXCEPTION 'Migration failed: % discount(s) could not be assigned a pricing_model_id because their organization has no default pricing model. Please create default pricing models for all organizations before running this migration.', null_count;
  END IF;
END $$;
--> statement-breakpoint

-- Step 3e: Validate pricing_model_id consistency across ALL foreign key relationships
-- These validations ensure that all records have matching pricing_model_id with their related entities
-- Pattern follows migration 0272_parched_cammi.sql validation approach
-- This is critical for maintaining data integrity in the pricing-model-scoped architecture

-- ============================================================================
-- DISCOUNT_REDEMPTIONS validations
-- ============================================================================

-- Validate: All discount_redemptions have discounts in the same pricing model
DO $$
DECLARE
  mismatch_count INTEGER;
  rec RECORD;
BEGIN
  SELECT COUNT(*) INTO mismatch_count
  FROM discount_redemptions dr
  JOIN discounts d ON dr.discount_id = d.id
  WHERE dr.pricing_model_id != d.pricing_model_id;

  IF mismatch_count > 0 THEN
    RAISE NOTICE 'Discount redemptions with discount pricing_model_id mismatch:';
    FOR rec IN
      SELECT dr.id as redemption_id, dr.discount_id, dr.pricing_model_id as redemption_pm, d.pricing_model_id as discount_pm, d.code
      FROM discount_redemptions dr
      JOIN discounts d ON dr.discount_id = d.id
      WHERE dr.pricing_model_id != d.pricing_model_id
      LIMIT 50
    LOOP
      RAISE NOTICE '  redemption_id=%, discount_id=%, redemption_pm=%, discount_pm=%, discount_code=%', rec.redemption_id, rec.discount_id, rec.redemption_pm, rec.discount_pm, rec.code;
    END LOOP;
    RAISE EXCEPTION 'Migration validation failed: % discount_redemptions have discount with mismatched pricing_model_id', mismatch_count;
  END IF;
END $$;
--> statement-breakpoint

-- Validate: All discount_redemptions have purchases in the same pricing model
DO $$
DECLARE
  mismatch_count INTEGER;
  rec RECORD;
BEGIN
  SELECT COUNT(*) INTO mismatch_count
  FROM discount_redemptions dr
  JOIN purchases p ON dr.purchase_id = p.id
  WHERE dr.pricing_model_id != p.pricing_model_id;

  IF mismatch_count > 0 THEN
    RAISE NOTICE 'Discount redemptions with purchase pricing_model_id mismatch:';
    FOR rec IN
      SELECT dr.id as redemption_id, dr.purchase_id, dr.pricing_model_id as redemption_pm, p.pricing_model_id as purchase_pm
      FROM discount_redemptions dr
      JOIN purchases p ON dr.purchase_id = p.id
      WHERE dr.pricing_model_id != p.pricing_model_id
      LIMIT 50
    LOOP
      RAISE NOTICE '  redemption_id=%, purchase_id=%, redemption_pm=%, purchase_pm=%', rec.redemption_id, rec.purchase_id, rec.redemption_pm, rec.purchase_pm;
    END LOOP;
    RAISE EXCEPTION 'Migration validation failed: % discount_redemptions have purchase with mismatched pricing_model_id', mismatch_count;
  END IF;
END $$;
--> statement-breakpoint

-- Validate: All discount_redemptions have subscriptions in the same pricing model (where applicable)
DO $$
DECLARE
  mismatch_count INTEGER;
  rec RECORD;
BEGIN
  SELECT COUNT(*) INTO mismatch_count
  FROM discount_redemptions dr
  JOIN subscriptions s ON dr.subscription_id = s.id
  WHERE dr.pricing_model_id != s.pricing_model_id;

  IF mismatch_count > 0 THEN
    RAISE NOTICE 'Discount redemptions with subscription pricing_model_id mismatch:';
    FOR rec IN
      SELECT dr.id as redemption_id, dr.subscription_id, dr.pricing_model_id as redemption_pm, s.pricing_model_id as subscription_pm
      FROM discount_redemptions dr
      JOIN subscriptions s ON dr.subscription_id = s.id
      WHERE dr.pricing_model_id != s.pricing_model_id
      LIMIT 50
    LOOP
      RAISE NOTICE '  redemption_id=%, subscription_id=%, redemption_pm=%, subscription_pm=%', rec.redemption_id, rec.subscription_id, rec.redemption_pm, rec.subscription_pm;
    END LOOP;
    RAISE EXCEPTION 'Migration validation failed: % discount_redemptions have subscription with mismatched pricing_model_id', mismatch_count;
  END IF;
END $$;
--> statement-breakpoint

-- ============================================================================
-- CHECKOUT_SESSIONS validations
-- ============================================================================

-- Validate: All checkout_sessions with discounts have matching pricing_model_id
DO $$
DECLARE
  mismatch_count INTEGER;
  rec RECORD;
BEGIN
  SELECT COUNT(*) INTO mismatch_count
  FROM checkout_sessions cs
  JOIN discounts d ON cs.discount_id = d.id
  WHERE cs.pricing_model_id != d.pricing_model_id;

  IF mismatch_count > 0 THEN
    RAISE NOTICE 'Checkout sessions with discount pricing_model_id mismatch:';
    FOR rec IN
      SELECT cs.id as checkout_session_id, cs.discount_id, cs.pricing_model_id as cs_pm, d.pricing_model_id as discount_pm, d.code
      FROM checkout_sessions cs
      JOIN discounts d ON cs.discount_id = d.id
      WHERE cs.pricing_model_id != d.pricing_model_id
      LIMIT 50
    LOOP
      RAISE NOTICE '  checkout_session_id=%, discount_id=%, cs_pm=%, discount_pm=%, discount_code=%', rec.checkout_session_id, rec.discount_id, rec.cs_pm, rec.discount_pm, rec.code;
    END LOOP;
    RAISE EXCEPTION 'Migration validation failed: % checkout_sessions have discount with mismatched pricing_model_id', mismatch_count;
  END IF;
END $$;
--> statement-breakpoint

-- Validate: All checkout_sessions with prices have matching pricing_model_id
DO $$
DECLARE
  mismatch_count INTEGER;
  rec RECORD;
BEGIN
  SELECT COUNT(*) INTO mismatch_count
  FROM checkout_sessions cs
  JOIN prices p ON cs.price_id = p.id
  WHERE cs.pricing_model_id != p.pricing_model_id;

  IF mismatch_count > 0 THEN
    RAISE NOTICE 'Checkout sessions with price pricing_model_id mismatch:';
    FOR rec IN
      SELECT cs.id as checkout_session_id, cs.price_id, cs.pricing_model_id as cs_pm, p.pricing_model_id as price_pm
      FROM checkout_sessions cs
      JOIN prices p ON cs.price_id = p.id
      WHERE cs.pricing_model_id != p.pricing_model_id
      LIMIT 50
    LOOP
      RAISE NOTICE '  checkout_session_id=%, price_id=%, cs_pm=%, price_pm=%', rec.checkout_session_id, rec.price_id, rec.cs_pm, rec.price_pm;
    END LOOP;
    RAISE EXCEPTION 'Migration validation failed: % checkout_sessions have price with mismatched pricing_model_id', mismatch_count;
  END IF;
END $$;
--> statement-breakpoint

-- Validate: All checkout_sessions with purchases have matching pricing_model_id
DO $$
DECLARE
  mismatch_count INTEGER;
  rec RECORD;
BEGIN
  SELECT COUNT(*) INTO mismatch_count
  FROM checkout_sessions cs
  JOIN purchases p ON cs.purchase_id = p.id
  WHERE cs.pricing_model_id != p.pricing_model_id;

  IF mismatch_count > 0 THEN
    RAISE NOTICE 'Checkout sessions with purchase pricing_model_id mismatch:';
    FOR rec IN
      SELECT cs.id as checkout_session_id, cs.purchase_id, cs.pricing_model_id as cs_pm, p.pricing_model_id as purchase_pm
      FROM checkout_sessions cs
      JOIN purchases p ON cs.purchase_id = p.id
      WHERE cs.pricing_model_id != p.pricing_model_id
      LIMIT 50
    LOOP
      RAISE NOTICE '  checkout_session_id=%, purchase_id=%, cs_pm=%, purchase_pm=%', rec.checkout_session_id, rec.purchase_id, rec.cs_pm, rec.purchase_pm;
    END LOOP;
    RAISE EXCEPTION 'Migration validation failed: % checkout_sessions have purchase with mismatched pricing_model_id', mismatch_count;
  END IF;
END $$;
--> statement-breakpoint

-- Validate: All checkout_sessions with invoices have matching pricing_model_id
DO $$
DECLARE
  mismatch_count INTEGER;
  rec RECORD;
BEGIN
  SELECT COUNT(*) INTO mismatch_count
  FROM checkout_sessions cs
  JOIN invoices i ON cs.invoice_id = i.id
  WHERE cs.pricing_model_id != i.pricing_model_id;

  IF mismatch_count > 0 THEN
    RAISE NOTICE 'Checkout sessions with invoice pricing_model_id mismatch:';
    FOR rec IN
      SELECT cs.id as checkout_session_id, cs.invoice_id, cs.pricing_model_id as cs_pm, i.pricing_model_id as invoice_pm
      FROM checkout_sessions cs
      JOIN invoices i ON cs.invoice_id = i.id
      WHERE cs.pricing_model_id != i.pricing_model_id
      LIMIT 50
    LOOP
      RAISE NOTICE '  checkout_session_id=%, invoice_id=%, cs_pm=%, invoice_pm=%', rec.checkout_session_id, rec.invoice_id, rec.cs_pm, rec.invoice_pm;
    END LOOP;
    RAISE EXCEPTION 'Migration validation failed: % checkout_sessions have invoice with mismatched pricing_model_id', mismatch_count;
  END IF;
END $$;
--> statement-breakpoint

-- Validate: All checkout_sessions with customers have matching pricing_model_id
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
      RAISE NOTICE '  checkout_session_id=%, customer_id=%, cs_pm=%, customer_pm=%, customer_external_id=%', rec.checkout_session_id, rec.customer_id, rec.cs_pm, rec.customer_pm, rec.external_id;
    END LOOP;
    RAISE EXCEPTION 'Migration validation failed: % checkout_sessions have customer with mismatched pricing_model_id', mismatch_count;
  END IF;
END $$;
--> statement-breakpoint

-- ============================================================================
-- FEE_CALCULATIONS validations
-- ============================================================================

-- Validate: All fee_calculations with discounts have matching pricing_model_id
DO $$
DECLARE
  mismatch_count INTEGER;
  rec RECORD;
BEGIN
  SELECT COUNT(*) INTO mismatch_count
  FROM fee_calculations fc
  JOIN discounts d ON fc.discount_id = d.id
  WHERE fc.pricing_model_id != d.pricing_model_id;

  IF mismatch_count > 0 THEN
    RAISE NOTICE 'Fee calculations with discount pricing_model_id mismatch:';
    FOR rec IN
      SELECT fc.id as fee_calc_id, fc.discount_id, fc.pricing_model_id as fc_pm, d.pricing_model_id as discount_pm, d.code
      FROM fee_calculations fc
      JOIN discounts d ON fc.discount_id = d.id
      WHERE fc.pricing_model_id != d.pricing_model_id
      LIMIT 50
    LOOP
      RAISE NOTICE '  fee_calc_id=%, discount_id=%, fc_pm=%, discount_pm=%, discount_code=%', rec.fee_calc_id, rec.discount_id, rec.fc_pm, rec.discount_pm, rec.code;
    END LOOP;
    RAISE EXCEPTION 'Migration validation failed: % fee_calculations have discount with mismatched pricing_model_id', mismatch_count;
  END IF;
END $$;
--> statement-breakpoint

-- Validate: All fee_calculations with checkout_sessions have matching pricing_model_id
DO $$
DECLARE
  mismatch_count INTEGER;
  rec RECORD;
BEGIN
  SELECT COUNT(*) INTO mismatch_count
  FROM fee_calculations fc
  JOIN checkout_sessions cs ON fc.checkout_session_id = cs.id
  WHERE fc.pricing_model_id != cs.pricing_model_id;

  IF mismatch_count > 0 THEN
    RAISE NOTICE 'Fee calculations with checkout_session pricing_model_id mismatch:';
    FOR rec IN
      SELECT fc.id as fee_calc_id, fc.checkout_session_id, fc.pricing_model_id as fc_pm, cs.pricing_model_id as cs_pm
      FROM fee_calculations fc
      JOIN checkout_sessions cs ON fc.checkout_session_id = cs.id
      WHERE fc.pricing_model_id != cs.pricing_model_id
      LIMIT 50
    LOOP
      RAISE NOTICE '  fee_calc_id=%, checkout_session_id=%, fc_pm=%, cs_pm=%', rec.fee_calc_id, rec.checkout_session_id, rec.fc_pm, rec.cs_pm;
    END LOOP;
    RAISE EXCEPTION 'Migration validation failed: % fee_calculations have checkout_session with mismatched pricing_model_id', mismatch_count;
  END IF;
END $$;
--> statement-breakpoint

-- Validate: All fee_calculations with purchases have matching pricing_model_id
DO $$
DECLARE
  mismatch_count INTEGER;
  rec RECORD;
BEGIN
  SELECT COUNT(*) INTO mismatch_count
  FROM fee_calculations fc
  JOIN purchases p ON fc.purchase_id = p.id
  WHERE fc.pricing_model_id != p.pricing_model_id;

  IF mismatch_count > 0 THEN
    RAISE NOTICE 'Fee calculations with purchase pricing_model_id mismatch:';
    FOR rec IN
      SELECT fc.id as fee_calc_id, fc.purchase_id, fc.pricing_model_id as fc_pm, p.pricing_model_id as purchase_pm
      FROM fee_calculations fc
      JOIN purchases p ON fc.purchase_id = p.id
      WHERE fc.pricing_model_id != p.pricing_model_id
      LIMIT 50
    LOOP
      RAISE NOTICE '  fee_calc_id=%, purchase_id=%, fc_pm=%, purchase_pm=%', rec.fee_calc_id, rec.purchase_id, rec.fc_pm, rec.purchase_pm;
    END LOOP;
    RAISE EXCEPTION 'Migration validation failed: % fee_calculations have purchase with mismatched pricing_model_id', mismatch_count;
  END IF;
END $$;
--> statement-breakpoint

-- Validate: All fee_calculations with prices have matching pricing_model_id
DO $$
DECLARE
  mismatch_count INTEGER;
  rec RECORD;
BEGIN
  SELECT COUNT(*) INTO mismatch_count
  FROM fee_calculations fc
  JOIN prices p ON fc.price_id = p.id
  WHERE fc.pricing_model_id != p.pricing_model_id;

  IF mismatch_count > 0 THEN
    RAISE NOTICE 'Fee calculations with price pricing_model_id mismatch:';
    FOR rec IN
      SELECT fc.id as fee_calc_id, fc.price_id, fc.pricing_model_id as fc_pm, p.pricing_model_id as price_pm
      FROM fee_calculations fc
      JOIN prices p ON fc.price_id = p.id
      WHERE fc.pricing_model_id != p.pricing_model_id
      LIMIT 50
    LOOP
      RAISE NOTICE '  fee_calc_id=%, price_id=%, fc_pm=%, price_pm=%', rec.fee_calc_id, rec.price_id, rec.fc_pm, rec.price_pm;
    END LOOP;
    RAISE EXCEPTION 'Migration validation failed: % fee_calculations have price with mismatched pricing_model_id', mismatch_count;
  END IF;
END $$;
--> statement-breakpoint

-- Step 4: Make pricing_model_id NOT NULL after backfill
ALTER TABLE "discounts" ALTER COLUMN "pricing_model_id" SET NOT NULL;
--> statement-breakpoint

-- Step 5: Add new unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS "discounts_code_pricing_model_id_unique_idx" ON "discounts" USING btree ("code","pricing_model_id");
--> statement-breakpoint

-- Step 6: Create pricing_model_id index for query performance
CREATE INDEX IF NOT EXISTS "discounts_pricing_model_id_idx" ON "discounts" USING btree ("pricing_model_id");
