ALTER TABLE "billing_period_items" DROP CONSTRAINT "billing_period_items_usage_meter_id_usage_meters_id_fk";
--> statement-breakpoint
ALTER TABLE "subscription_items" DROP CONSTRAINT "subscription_items_usage_meter_id_usage_meters_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "billing_period_items_usage_meter_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "subscription_items_usage_meter_id_idx";--> statement-breakpoint
ALTER TABLE "billing_period_items" DROP COLUMN IF EXISTS "usage_events_per_unit";--> statement-breakpoint
ALTER TABLE "billing_period_items" DROP COLUMN IF EXISTS "usage_meter_id";--> statement-breakpoint
ALTER TABLE "prices" DROP COLUMN IF EXISTS "starts_with_credit_trial";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN IF EXISTS "display_features";--> statement-breakpoint
ALTER TABLE "subscription_items" DROP COLUMN IF EXISTS "usage_events_per_unit";--> statement-breakpoint
ALTER TABLE "subscription_items" DROP COLUMN IF EXISTS "usage_meter_id";