ALTER TABLE "PurchaseSessions" ADD COLUMN "InvoiceId" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "PurchaseSessions" ADD CONSTRAINT "PurchaseSessions_InvoiceId_Invoices_id_fk" FOREIGN KEY ("InvoiceId") REFERENCES "public"."Invoices"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
