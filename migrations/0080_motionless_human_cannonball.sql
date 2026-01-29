DO $$ BEGIN
    CREATE TYPE "CommunityPlatform" AS ENUM ('discord', 'slack');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "Communities" (
	"id" serial PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now(),
	"externalId" text NOT NULL,
	"OrganizationId" integer NOT NULL,
	"IntegrationId" integer,
	"name" text NOT NULL,
	"platform" "CommunityPlatform" NOT NULL,
	"ProductId" integer,
	CONSTRAINT "Communities_externalId_unique" UNIQUE("externalId")
);
--> statement-breakpoint
ALTER TABLE "Communities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP INDEX IF EXISTS "Variants_stripePriceId_idx";--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Communities" ADD CONSTRAINT "Communities_OrganizationId_Organizations_id_fk" FOREIGN KEY ("OrganizationId") REFERENCES "public"."Organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Communities" ADD CONSTRAINT "Communities_IntegrationId_Integrations_id_fk" FOREIGN KEY ("IntegrationId") REFERENCES "public"."Integrations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Communities" ADD CONSTRAINT "Communities_ProductId_Products_id_fk" FOREIGN KEY ("ProductId") REFERENCES "public"."Products"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Communities_OrganizationId_idx" ON "Communities" USING btree ("OrganizationId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Communities_IntegrationId_idx" ON "Communities" USING btree ("IntegrationId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Variants_stripePriceId_unique_idx" ON "Variants" USING btree ("stripePriceId");--> statement-breakpoint
CREATE POLICY "Enable read for own organizations" ON "Products" AS PERMISSIVE FOR ALL TO "authenticated" USING ("OrganizationId" in (select "OrganizationId" from "Memberships"));--> statement-breakpoint
CREATE POLICY "Enable all for self organizations via products" ON "Variants" AS PERMISSIVE FOR ALL TO "authenticated" USING ("ProductId" in (select "id" from "Products"));--> statement-breakpoint
CREATE POLICY "Enable read for own organizations" ON "Communities" AS PERMISSIVE FOR ALL TO "authenticated" USING ("OrganizationId" in (select "OrganizationId" from "Memberships")) WITH CHECK (
          "OrganizationId" in (select "OrganizationId" from "Memberships")
          AND "ProductId" in (select id from "Products")
          AND (
            "IntegrationId" IS NULL 
            OR 
            EXISTS (
              SELECT 1 FROM "Integrations" i 
              WHERE i.id = "IntegrationId" 
              AND CASE 
                WHEN platform = 'discord' THEN i.provider = 'discord'
                WHEN platform = 'slack' THEN i.provider = 'slack'
              END
            )
          )
        );--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "Files" TO authenticated USING ("OrganizationId" in (select "OrganizationId" from "Memberships")) WITH CHECK ("ProductId" is null OR "ProductId" in (select "id" from "Products"));--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "Links" TO authenticated USING ("OrganizationId" in (select "OrganizationId" from "Memberships")) WITH CHECK ("ProductId" is null OR "ProductId" in (select "id" from "Products"));