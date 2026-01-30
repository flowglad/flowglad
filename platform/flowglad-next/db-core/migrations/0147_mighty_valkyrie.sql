DROP POLICY "Enable read for own organizations" ON "ProductFeatures" CASCADE;--> statement-breakpoint
DROP TABLE "ProductFeatures" CASCADE;--> statement-breakpoint
ALTER TABLE "Products" ADD COLUMN "displayFeatures" jsonb;