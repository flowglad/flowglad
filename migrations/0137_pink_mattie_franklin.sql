ALTER TABLE "BillingPeriodItems" DROP CONSTRAINT "BillingPeriodItems_SubscriptionItemId_SubscriptionItems_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "BillingPeriodItems_SubscriptionItemId_idx";--> statement-breakpoint
ALTER TABLE "BillingPeriodItems" DROP COLUMN IF EXISTS "SubscriptionItemId";--> statement-breakpoint
ALTER TABLE "SubscriptionItems" DROP COLUMN IF EXISTS "removedDate";