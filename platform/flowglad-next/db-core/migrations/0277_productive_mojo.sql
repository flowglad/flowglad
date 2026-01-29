ALTER TABLE "resource_claims" DROP CONSTRAINT "resource_claims_subscription_item_feature_id_subscription_item_features_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "resource_claims_subscription_item_feature_id_idx";--> statement-breakpoint
ALTER TABLE "resource_claims" ADD COLUMN "expired_at" timestamptz;--> statement-breakpoint
ALTER TABLE "resource_claims" DROP COLUMN IF EXISTS "subscription_item_feature_id";