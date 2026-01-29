ALTER TABLE "Customers" RENAME COLUMN "billing_address" TO "billingAddress";--> statement-breakpoint
ALTER TABLE "Customers" ALTER COLUMN "billingAddress" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "Payments" ALTER COLUMN "subtotal" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "Payments" ALTER COLUMN "applicationFee" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "Invoices" ADD COLUMN "taxAmount" integer;--> statement-breakpoint
ALTER TABLE "Invoices" ADD COLUMN "subtotal" integer;--> statement-breakpoint
ALTER TABLE "Invoices" ADD COLUMN "taxType" "TaxType";--> statement-breakpoint
ALTER TABLE "Invoices" ADD COLUMN "taxCountry" "CountryCode";--> statement-breakpoint
ALTER TABLE "Invoices" ADD COLUMN "taxState" text;--> statement-breakpoint
ALTER TABLE "Invoices" ADD COLUMN "taxRatePercentage" text;--> statement-breakpoint
ALTER TABLE "Invoices" ADD COLUMN "applicationFee" integer;--> statement-breakpoint
ALTER TABLE "Variants" DROP COLUMN IF EXISTS "includeTaxInPrice";