ALTER TYPE "BillingPeriodStatus" ADD VALUE IF NOT EXISTS 'past_due';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'requires_action';
ALTER TABLE "BillingPeriods" ALTER COLUMN "status" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "Payments" ADD COLUMN IF NOT EXISTS "BillingPeriodId" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Payments" ADD CONSTRAINT "Payments_BillingPeriodId_BillingPeriods_id_fk" FOREIGN KEY ("BillingPeriodId") REFERENCES "public"."BillingPeriods"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'cancellation_scheduled';
ALTER TYPE "BillingPeriodStatus" ADD VALUE IF NOT EXISTS 'scheduled_to_cancel';
