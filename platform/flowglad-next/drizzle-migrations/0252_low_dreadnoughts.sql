ALTER TABLE "subscription_items" ALTER COLUMN "price_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_items" ADD COLUMN "manually_created" boolean DEFAULT false NOT NULL;
ALTER TABLE "subscription_items" ADD CONSTRAINT "subscription_items_manual_check"
CHECK (
    (
      "manually_created" = true
      AND "price_id" is NULL
      AND "unit_price" = 0
      AND "quantity" = 0
    )
    OR (
      "manually_created" = false
      AND "price_id" IS NOT NULL
      AND "quantity" > 0
    )
);
CREATE UNIQUE INDEX IF NOT EXISTS "subscription_items_manual_unique_idx" 
ON "subscription_items" ("subscription_id") 
WHERE "manually_created" = true and "expired_at" IS NULL;
-- Data Migration: Create manual subscription items and migrate features
DO $$
DECLARE
  subscription_record RECORD;
  manual_item_id text;
  new_item_id text;
  next_position bigint;
BEGIN
  -- Loop through each unique subscription that has manual features
  FOR subscription_record IN
    SELECT DISTINCT 
      si."subscription_id",
      si."livemode"
    FROM "subscription_item_features" sif
    INNER JOIN "subscription_items" si ON sif."subscription_item_id" = si."id"
    WHERE sif."manually_created" = true
  LOOP
    -- Check if manual item already exists for this subscription
    SELECT id INTO manual_item_id
    FROM "subscription_items"
    WHERE "subscription_id" = subscription_record."subscription_id"
      AND "manually_created" = true
      AND "expired_at" IS NULL
    LIMIT 1;

    -- Create manual item if it doesn't exist
    IF manual_item_id IS NULL THEN
      -- Calculate the next position by finding the max position and adding 1
      SELECT COALESCE(MAX("position"), 0) + 1 INTO next_position
      FROM "subscription_items";
      
      -- Generate ID in format: si_<nanoid> (matching core.nanoid format)
      -- Using URL-safe alphabet: 0-9A-Za-z (62 chars), length 21
      new_item_id := 'si_' || array_to_string(
        ARRAY(
          SELECT substr(
            '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
            floor(random() * 62 + 1)::int,
            1
          )
          FROM generate_series(1, 21)
        ),
        ''
      );
      
      INSERT INTO "subscription_items" (
        "id", 
        "subscription_id", 
        "name", 
        "price_id", 
        "unit_price", 
        "quantity", 
        "added_date", 
        "expired_at", 
        "metadata", 
        "external_id",
        "type", 
        "manually_created", 
        "livemode", 
        "position",
        "created_at", 
        "updated_at"
      ) VALUES (
        new_item_id,
        subscription_record."subscription_id",
        'Manual Features',
        NULL,
        0,
        0,
        NOW(),
        NULL,
        NULL,
        NULL,
        'static',
        true,
        subscription_record."livemode",
        next_position,
        NOW(),
        NOW()
      );
      
      manual_item_id := new_item_id;
    END IF;

    -- Update all manual features for this subscription to point to the manual item
    -- Find all features that are manual and currently point to non-manual items
    UPDATE "subscription_item_features"
    SET "subscription_item_id" = manual_item_id
    WHERE "subscription_item_id" IN (
      SELECT si."id"
      FROM "subscription_items" si
      WHERE si."subscription_id" = subscription_record."subscription_id"
        AND si."manually_created" = false
    )
    AND "manually_created" = true;
  END LOOP;
END $$;

-- Verification: Ensure all manual features point to manual items
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "subscription_item_features" sif
    INNER JOIN "subscription_items" si ON sif."subscription_item_id" = si."id"
    WHERE sif."manually_created" = true
      AND si."manually_created" = false
  ) THEN
    RAISE EXCEPTION 'Data migration failed - some manual features still point to non-manual items';
  END IF;
END $$;