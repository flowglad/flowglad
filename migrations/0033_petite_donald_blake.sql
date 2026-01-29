ALTER TABLE "Invoices" ADD COLUMN "invoiceDate" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "Invoices" ADD COLUMN "invoiceDueDate" timestamp;