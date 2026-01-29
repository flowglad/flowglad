ALTER TABLE "FeeCalculations" ALTER COLUMN "stripeTaxCalculationId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "Payments" ALTER COLUMN "CustomerProfileId" SET NOT NULL;