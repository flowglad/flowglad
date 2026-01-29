UPDATE "Organizations" SET "CountryId" = (SELECT id FROM "Countries" WHERE name = 'United States') WHERE "CountryId" IS NULL;
ALTER TABLE "Organizations" ALTER COLUMN "CountryId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "Variants" ADD COLUMN "currency" "CurrencyCode";