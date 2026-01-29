ALTER TABLE "PurchaseSessions" ADD COLUMN "CustomerProfileId" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "PurchaseSessions" ADD CONSTRAINT "PurchaseSessions_CustomerProfileId_CustomerProfiles_id_fk" FOREIGN KEY ("CustomerProfileId") REFERENCES "public"."CustomerProfiles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "PurchaseSessions_CustomerProfileId_idx" ON "PurchaseSessions" USING btree ("CustomerProfileId");--> statement-breakpoint
ALTER TABLE "Variants" DROP COLUMN IF EXISTS "firstInstallmentAmount";--> statement-breakpoint
ALTER TABLE "Variants" DROP COLUMN IF EXISTS "totalInstallmentsAmount";