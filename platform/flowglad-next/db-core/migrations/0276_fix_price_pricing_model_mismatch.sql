-- Data fix: Sync prices.pricing_model_id with their product's pricing_model_id
--
-- Root cause: Two commits (251c217d, 67ba36c9) created testmode prices that
-- incorrectly referenced livemode pricing models, while their products correctly
-- referenced testmode pricing models.
--
-- This caused "Price not found" errors when creating subscriptions via API because
-- RLS on pricing_models blocked access to livemode pricing models in testmode context.
--
-- See: BUG-PRICE-NOT-FOUND.md for full investigation details.

UPDATE prices p
SET pricing_model_id = prod.pricing_model_id
FROM products prod
WHERE p.product_id = prod.id
  AND p.pricing_model_id != prod.pricing_model_id;
