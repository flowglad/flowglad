ALTER TABLE "Organizations" DROP CONSTRAINT "Organizations_name_unique";--> statement-breakpoint
ALTER TABLE "Organizations" ADD COLUMN "subdomainSlug" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Integrations_OrganizationId_provider_unique_idx" ON "Integrations" USING btree ("OrganizationId","provider");--> statement-breakpoint
ALTER TABLE "Organizations" ADD CONSTRAINT "Organizations_subdomainSlug_unique" UNIQUE("subdomainSlug");