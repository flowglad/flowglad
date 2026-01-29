ALTER TABLE "Invoices" ALTER COLUMN "status" SET DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE "Invoices" ALTER COLUMN "status" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "Customers" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "Testimonials" ADD COLUMN "text" text;