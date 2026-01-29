UPDATE "Variants" SET "currency" = 'USD' WHERE "currency" IS NULL;
ALTER TABLE "Variants" ALTER COLUMN "currency" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "FeeCalculations" ADD COLUMN "currency" "CurrencyCode";--> statement-breakpoint
UPDATE "FeeCalculations" SET "currency" = 'USD' WHERE "currency" IS NULL;--> statement-breakpoint
ALTER TABLE "FeeCalculations" ALTER COLUMN "currency" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "Invoices" ADD COLUMN "currency" "CurrencyCode";--> statement-breakpoint
UPDATE "Invoices" SET "currency" = 'USD' WHERE "currency" IS NULL;--> statement-breakpoint
ALTER TABLE "Invoices" ALTER COLUMN "currency" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "Organizations" ADD COLUMN "defaultCurrency" "CurrencyCode";--> statement-breakpoint
UPDATE "Organizations" SET "defaultCurrency" = 'USD' WHERE "defaultCurrency" IS NULL;--> statement-breakpoint
ALTER TABLE "Organizations" ALTER COLUMN "defaultCurrency" SET NOT NULL;