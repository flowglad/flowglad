DO $$ BEGIN
    CREATE TYPE "InvoiceStatus" AS ENUM ('draft', 'open', 'paid', 'uncollectible', 'void', 'refunded', 'partially_refunded', 'awaiting_payment_confirmation');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;


CREATE TABLE IF NOT EXISTS "invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now(),
	"externalId" text,
	"ProjectId" integer NOT NULL,
	"invoiceNumber" text NOT NULL,
	"stripePaymentIntentId" text,
	"status" "InvoiceStatus",
	"pdfURL" text,
	CONSTRAINT "invoices_externalId_unique" UNIQUE("externalId"),
	CONSTRAINT "invoices_invoiceNumber_unique" UNIQUE("invoiceNumber")
);
--> statement-breakpoint
ALTER TABLE "Projects" ADD COLUMN "billingCycleAnchor" timestamp;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_ProjectId_Projects_id_fk" FOREIGN KEY ("ProjectId") REFERENCES "public"."Projects"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_invoiceNumber_unique_idx" ON "invoices" USING btree ("invoiceNumber");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_ProjectId_idx" ON "invoices" USING btree ("ProjectId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_status_idx" ON "invoices" USING btree ("status");