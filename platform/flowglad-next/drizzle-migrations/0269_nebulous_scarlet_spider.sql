DROP INDEX IF EXISTS "subscription_item_features_subscription_item_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "subscription_items_subscription_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "subscriptions_customer_id_idx";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscription_item_features_subscription_item_id_livemode_idx" ON "subscription_item_features" USING btree ("subscription_item_id","livemode");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscription_items_subscription_id_livemode_idx" ON "subscription_items" USING btree ("subscription_id","livemode");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriptions_customer_id_livemode_idx" ON "subscriptions" USING btree ("customer_id","livemode");