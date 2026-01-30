-- Nullify productId for usage prices before adding CHECK constraint
-- Usage prices belong to usage meters, not products
UPDATE "prices" SET "product_id" = NULL WHERE "type" = 'usage';
--> statement-breakpoint
-- Delete orphaned usage prices (no usage_meter_id) that are TEST MODE ONLY
-- These are legacy bug artifacts from ~March 2025 with zero usage
-- If any LIVE MODE orphaned usage prices exist, the CHECK constraint below will fail
-- which alerts us to investigate rather than silently allowing bad production data
DELETE FROM "prices" WHERE "type" = 'usage' AND "usage_meter_id" IS NULL AND "livemode" = false;
--> statement-breakpoint
ALTER TABLE "prices" ADD CONSTRAINT "prices_product_usage_meter_mutual_exclusivity" CHECK ((
        ("type" = 'usage' AND "product_id" IS NULL AND "usage_meter_id" IS NOT NULL)
        OR
        ("type" != 'usage' AND "product_id" IS NOT NULL AND "usage_meter_id" IS NULL)
      ));
