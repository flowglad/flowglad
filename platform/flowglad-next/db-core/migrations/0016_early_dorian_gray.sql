DROP INDEX IF EXISTS "Customers_name_unique_idx";--> statement-breakpoint
ALTER TABLE "Projects" ALTER COLUMN "trialPeriodDays" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "Projects" ALTER COLUMN "firstInvoiceValue" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "Projects" ALTER COLUMN "totalProjectValue" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "CustomerProfiles" ADD COLUMN "stripeCustomerId" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "CustomerProfileId" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "paymentIntentId" text;--> statement-breakpoint
ALTER TABLE "Projects" ADD COLUMN "startDate" timestamp;--> statement-breakpoint
ALTER TABLE "Projects" ADD COLUMN "endDate" timestamp;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_CustomerProfileId_CustomerProfiles_id_fk" FOREIGN KEY ("CustomerProfileId") REFERENCES "public"."CustomerProfiles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerProfiles_stripeCustomerId_unique_idx" ON "CustomerProfiles" USING btree ("stripeCustomerId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_CustomerProfileId_idx" ON "invoices" USING btree ("CustomerProfileId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_paymentIntentId_idx" ON "invoices" USING btree ("paymentIntentId");