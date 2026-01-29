ALTER TABLE "Invoices" ADD COLUMN "bankPaymentOnly" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "Projects" ADD COLUMN "bankPaymentOnly" boolean DEFAULT false;