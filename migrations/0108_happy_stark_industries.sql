ALTER TABLE "ProperNouns" DROP CONSTRAINT "ProperNouns_handle_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "ProperNouns_EntityId_entityType_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "ProperNouns_handle_OrganizationId_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "proper_noun_handle_search_index";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProperNouns_EntityId_entityType_unique_idx" ON "ProperNouns" USING btree ("EntityId","entityType");--> statement-breakpoint
ALTER TABLE "ProperNouns" DROP COLUMN IF EXISTS "handle";
CREATE EXTENSION IF NOT EXISTS pg_trgm;
