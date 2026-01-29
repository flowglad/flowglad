ALTER TABLE "Invoices" RENAME COLUMN "invoiceDueDate" TO "dueDate";--> statement-breakpoint
ALTER TABLE "Invoices" ADD COLUMN "memo" text;