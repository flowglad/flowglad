ALTER TABLE "Projects" ADD COLUMN "pricePerBillingCycle" integer;--> statement-breakpoint
ALTER TABLE "Projects" ADD COLUMN "intervalUnit" "IntervalUnit";--> statement-breakpoint
ALTER TABLE "Projects" ADD COLUMN "intervalCount" integer;