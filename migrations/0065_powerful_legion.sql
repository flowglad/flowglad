CREATE INDEX IF NOT EXISTS "PurchaseSessions_OrganizationId_idx" ON "PurchaseSessions" USING btree ("OrganizationId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "PurchaseSessions_status_idx" ON "PurchaseSessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "PurchaseSessions_stripeSetupIntentId_idx" ON "PurchaseSessions" USING btree ("stripeSetupIntentId");