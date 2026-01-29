ALTER TABLE "Payments" ALTER COLUMN "refunded" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "SubscriptionItems" ADD COLUMN IF NOT EXISTS "name" text;