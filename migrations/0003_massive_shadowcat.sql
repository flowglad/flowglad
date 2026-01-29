DROP TABLE "Countries";--> statement-breakpoint
ALTER TABLE "Test" DROP CONSTRAINT IF EXISTS "Countries_externalId_unique";--> statement-breakpoint
ALTER TABLE "Test" ADD CONSTRAINT "Test_externalId_unique" UNIQUE("externalId");