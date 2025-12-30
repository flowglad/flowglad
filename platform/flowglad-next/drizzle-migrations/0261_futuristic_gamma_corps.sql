ALTER TABLE "billing_periods" ADD COLUMN "pricing_model_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_runs" ADD COLUMN "pricing_model_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "discount_redemptions" ADD COLUMN "pricing_model_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "pricing_model_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "pricing_model_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD COLUMN "pricing_model_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_items" ADD COLUMN "pricing_model_id" text NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "billing_periods" ADD CONSTRAINT "billing_periods_pricing_model_id_pricing_models_id_fk" FOREIGN KEY ("pricing_model_id") REFERENCES "public"."pricing_models"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "billing_runs" ADD CONSTRAINT "billing_runs_pricing_model_id_pricing_models_id_fk" FOREIGN KEY ("pricing_model_id") REFERENCES "public"."pricing_models"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "discount_redemptions" ADD CONSTRAINT "discount_redemptions_pricing_model_id_pricing_models_id_fk" FOREIGN KEY ("pricing_model_id") REFERENCES "public"."pricing_models"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_pricing_model_id_pricing_models_id_fk" FOREIGN KEY ("pricing_model_id") REFERENCES "public"."pricing_models"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_pricing_model_id_pricing_models_id_fk" FOREIGN KEY ("pricing_model_id") REFERENCES "public"."pricing_models"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_pricing_model_id_pricing_models_id_fk" FOREIGN KEY ("pricing_model_id") REFERENCES "public"."pricing_models"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscription_items" ADD CONSTRAINT "subscription_items_pricing_model_id_pricing_models_id_fk" FOREIGN KEY ("pricing_model_id") REFERENCES "public"."pricing_models"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_periods_pricing_model_id_idx" ON "billing_periods" USING btree ("pricing_model_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_runs_pricing_model_id_idx" ON "billing_runs" USING btree ("pricing_model_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discount_redemptions_pricing_model_id_idx" ON "discount_redemptions" USING btree ("pricing_model_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_pricing_model_id_idx" ON "invoices" USING btree ("pricing_model_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_entries_pricing_model_id_idx" ON "ledger_entries" USING btree ("pricing_model_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_transactions_pricing_model_id_idx" ON "ledger_transactions" USING btree ("pricing_model_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscription_items_pricing_model_id_idx" ON "subscription_items" USING btree ("pricing_model_id");