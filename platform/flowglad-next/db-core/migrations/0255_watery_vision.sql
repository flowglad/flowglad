ALTER TABLE "ledger_accounts" ALTER COLUMN "usage_meter_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "price_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_credit_balance_adjustments" ADD COLUMN "usage_meter_id" text NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "usage_credit_balance_adjustments" ADD CONSTRAINT "usage_credit_balance_adjustments_usage_meter_id_usage_meters_id_fk" FOREIGN KEY ("usage_meter_id") REFERENCES "public"."usage_meters"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
