CREATE TABLE IF NOT EXISTS "InvoiceLineItems" (
	"id" serial PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now(),
	"externalId" text,
	"InvoiceId" integer NOT NULL,
	"quantity" integer NOT NULL,
	"VariantId" integer,
	"description" text,
	"price" integer NOT NULL,
	CONSTRAINT "InvoiceLineItems_externalId_unique" UNIQUE("externalId")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "InvoiceLineItems" ADD CONSTRAINT "InvoiceLineItems_InvoiceId_invoices_id_fk" FOREIGN KEY ("InvoiceId") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "InvoiceLineItems" ADD CONSTRAINT "InvoiceLineItems_VariantId_Variants_id_fk" FOREIGN KEY ("VariantId") REFERENCES "public"."Variants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "InvoiceLineItems_InvoiceId_idx" ON "InvoiceLineItems" USING btree ("InvoiceId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "InvoiceLineItems_VariantId_idx" ON "InvoiceLineItems" USING btree ("VariantId");