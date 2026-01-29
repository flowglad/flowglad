ALTER TABLE "Purchases" ADD COLUMN "stripeSetupIntentId" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Purchases_stripeSetupIntentId_idx" ON "Purchases" USING btree ("stripeSetupIntentId");--> statement-breakpoint
ALTER TABLE "Purchases" ADD CONSTRAINT "Purchases_stripeSetupIntentId_unique" UNIQUE("stripeSetupIntentId");