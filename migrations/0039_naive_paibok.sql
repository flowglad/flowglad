ALTER TABLE "Invoices" ADD COLUMN "stripeTaxCalculationId" text;--> statement-breakpoint
ALTER TABLE "Invoices" ADD COLUMN "stripeTaxTransactionId" text;--> statement-breakpoint
ALTER TABLE "Payments" ADD COLUMN "stripeTaxCalculationId" text;--> statement-breakpoint
ALTER TABLE "Payments" ADD COLUMN "stripeTaxTransactionId" text;--> statement-breakpoint
ALTER TABLE "Projects" ADD COLUMN "stripeTaxCalculationId" text;--> statement-breakpoint
ALTER TABLE "Projects" ADD COLUMN "taxAmount" integer;