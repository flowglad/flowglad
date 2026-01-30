ALTER TABLE "Deals" RENAME TO "Projects";--> statement-breakpoint
ALTER TABLE "Projects" DROP CONSTRAINT "Deals_externalId_unique";--> statement-breakpoint
ALTER TABLE "Projects" DROP CONSTRAINT "Deals_CustomerProfileId_CustomerProfiles_id_fk";
--> statement-breakpoint
ALTER TABLE "Projects" DROP CONSTRAINT "Deals_OrganizationId_Organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "Projects" DROP CONSTRAINT "Deals_VariantId_Variants_id_fk";
--> statement-breakpoint
ALTER TABLE "Projects" DROP CONSTRAINT "Deals_TermId_Terms_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "Deals_CustomerProfileId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Deals_OrganizationId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Deals_VariantId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Deals_TermId_idx";--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Projects" ADD CONSTRAINT "Projects_CustomerProfileId_CustomerProfiles_id_fk" FOREIGN KEY ("CustomerProfileId") REFERENCES "public"."CustomerProfiles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Projects" ADD CONSTRAINT "Projects_OrganizationId_Organizations_id_fk" FOREIGN KEY ("OrganizationId") REFERENCES "public"."Organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Projects" ADD CONSTRAINT "Projects_VariantId_Variants_id_fk" FOREIGN KEY ("VariantId") REFERENCES "public"."Variants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Projects" ADD CONSTRAINT "Projects_TermId_Terms_id_fk" FOREIGN KEY ("TermId") REFERENCES "public"."Terms"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Projects_CustomerProfileId_idx" ON "Projects" USING btree ("CustomerProfileId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Projects_OrganizationId_idx" ON "Projects" USING btree ("OrganizationId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Projects_VariantId_idx" ON "Projects" USING btree ("VariantId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Projects_TermId_idx" ON "Projects" USING btree ("TermId");--> statement-breakpoint
ALTER TABLE "Projects" ADD CONSTRAINT "Projects_externalId_unique" UNIQUE("externalId");