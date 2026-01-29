DROP INDEX IF EXISTS "Payments_stripePaymentIntentId_unique_idx";--> statement-breakpoint
ALTER TABLE "BillingPeriods" ALTER COLUMN "status" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "BillingRuns" ADD COLUMN "stripePaymentIntentId" text;--> statement-breakpoint
ALTER TABLE "BillingRuns" ADD COLUMN "lastStripePaymentIntentEventTimestamp" timestamp;--> statement-breakpoint
ALTER TABLE "Payments" ADD COLUMN "PaymentMethodId" text;--> statement-breakpoint
ALTER TABLE "Payments" ADD COLUMN "stripeChargeId" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Payments" ADD CONSTRAINT "Payments_PaymentMethodId_PaymentMethods_id_fk" FOREIGN KEY ("PaymentMethodId") REFERENCES "public"."PaymentMethods"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
