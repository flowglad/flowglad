ALTER TABLE "PurchaseSessions" ADD COLUMN "PurchaseId" integer;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "PurchaseSessions" ADD CONSTRAINT "PurchaseSessions_PurchaseId_Purchases_id_fk" FOREIGN KEY ("PurchaseId") REFERENCES "public"."Purchases"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "PurchaseSessions_PurchaseId_idx" ON "PurchaseSessions" USING btree ("PurchaseId");