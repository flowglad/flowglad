ALTER TABLE "ProperNouns" DROP CONSTRAINT IF EXISTS "ProperNouns_handle_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "ProperNouns_EntityId_entityType_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "ProperNouns_handle_OrganizationId_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "proper_noun_handle_search_index";--> statement-breakpoint
ALTER TABLE "Payments" ADD COLUMN "CustomerProfileId" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Payments" ADD CONSTRAINT "Payments_CustomerProfileId_CustomerProfiles_id_fk" FOREIGN KEY ("CustomerProfileId") REFERENCES "public"."CustomerProfiles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Payments_CustomerProfileId_idx" ON "Payments" USING btree ("CustomerProfileId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProperNouns_EntityId_entityType_unique_idx" ON "ProperNouns" USING btree ("EntityId","entityType");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ProperNouns_name_idx" ON "ProperNouns" USING btree ("name");--> statement-breakpoint
ALTER TABLE "ProperNouns" DROP COLUMN IF EXISTS "handle";--> statement-breakpoint
CREATE POLICY "Enable select for own organization" ON "Payments" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("OrganizationId" in (select "OrganizationId" from "Memberships"));--> statement-breakpoint
CREATE POLICY "Enable update for own organization" ON "Payments" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("OrganizationId" in (select "OrganizationId" from "Memberships"));