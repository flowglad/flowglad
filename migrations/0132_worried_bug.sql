DROP INDEX IF EXISTS "Payments_stripePaymentIntentId_unique_idx";--> statement-breakpoint
ALTER TABLE "BillingRuns" ADD COLUMN IF NOT EXISTS "stripePaymentIntentId" text;--> statement-breakpoint
ALTER TABLE "BillingRuns" ADD COLUMN IF NOT EXISTS "lastStripePaymentIntentEventTimestamp" timestamp;--> statement-breakpoint
ALTER TABLE "Payments" ADD COLUMN IF NOT EXISTS "PaymentMethodId" text;--> statement-breakpoint
ALTER TABLE "Payments" ADD COLUMN IF NOT EXISTS "stripeChargeId" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Payments" ADD CONSTRAINT "Payments_PaymentMethodId_PaymentMethods_id_fk" FOREIGN KEY ("PaymentMethodId") REFERENCES "public"."PaymentMethods"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
