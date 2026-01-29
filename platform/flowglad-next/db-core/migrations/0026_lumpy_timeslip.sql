ALTER TABLE "Projects" ADD COLUMN "stripePaymentIntentId" text;--> statement-breakpoint
ALTER TABLE "Variants" ADD COLUMN "trialPeriodDays" integer;--> statement-breakpoint
ALTER TABLE "Variants" ADD COLUMN "setupFeeAmount" integer;--> statement-breakpoint
ALTER TABLE "Variants" ADD COLUMN "firstInstallmentAmount" integer;--> statement-breakpoint
ALTER TABLE "Variants" ADD COLUMN "totalInstallmentsAmount" integer;--> statement-breakpoint
ALTER TABLE "Variants" DROP COLUMN IF EXISTS "isProjectVariant";--> statement-breakpoint
ALTER TABLE "Projects" ADD CONSTRAINT "Projects_stripePaymentIntentId_unique" UNIQUE("stripePaymentIntentId");