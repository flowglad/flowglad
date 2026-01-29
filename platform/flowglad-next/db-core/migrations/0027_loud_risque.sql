ALTER TABLE "invoices" RENAME TO "Invoices";--> statement-breakpoint
ALTER TABLE "Invoices" DROP CONSTRAINT "invoices_externalId_unique";--> statement-breakpoint
ALTER TABLE "Invoices" DROP CONSTRAINT "invoices_invoiceNumber_unique";--> statement-breakpoint
ALTER TABLE "InvoiceLineItems" DROP CONSTRAINT "InvoiceLineItems_InvoiceId_invoices_id_fk";
--> statement-breakpoint
ALTER TABLE "Invoices" DROP CONSTRAINT "invoices_ProjectId_Projects_id_fk";
--> statement-breakpoint
ALTER TABLE "Invoices" DROP CONSTRAINT "invoices_CustomerProfileId_CustomerProfiles_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "invoices_invoiceNumber_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "invoices_ProjectId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "invoices_status_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "invoices_CustomerProfileId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "invoices_paymentIntentId_idx";--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "InvoiceLineItems" ADD CONSTRAINT "InvoiceLineItems_InvoiceId_Invoices_id_fk" FOREIGN KEY ("InvoiceId") REFERENCES "public"."Invoices"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Invoices" ADD CONSTRAINT "Invoices_ProjectId_Projects_id_fk" FOREIGN KEY ("ProjectId") REFERENCES "public"."Projects"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Invoices" ADD CONSTRAINT "Invoices_CustomerProfileId_CustomerProfiles_id_fk" FOREIGN KEY ("CustomerProfileId") REFERENCES "public"."CustomerProfiles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Invoices_invoiceNumber_unique_idx" ON "Invoices" USING btree ("invoiceNumber");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Invoices_ProjectId_idx" ON "Invoices" USING btree ("ProjectId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Invoices_status_idx" ON "Invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Invoices_CustomerProfileId_idx" ON "Invoices" USING btree ("CustomerProfileId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Invoices_paymentIntentId_idx" ON "Invoices" USING btree ("paymentIntentId");--> statement-breakpoint
ALTER TABLE "Invoices" ADD CONSTRAINT "Invoices_externalId_unique" UNIQUE("externalId");--> statement-breakpoint
ALTER TABLE "Invoices" ADD CONSTRAINT "Invoices_invoiceNumber_unique" UNIQUE("invoiceNumber");