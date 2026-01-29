ALTER TABLE "CustomerProfiles" ALTER COLUMN "archived" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ApiKeys" ADD COLUMN "unkeyId" text NOT NULL;--> statement-breakpoint
ALTER TABLE "CustomerProfiles" ADD COLUMN "externalId" text;--> statement-breakpoint
ALTER TABLE "ApiKeys" DROP COLUMN IF EXISTS "lastUsedAt";
ALTER TABLE "Variants" DROP COLUMN IF EXISTS "externalId";