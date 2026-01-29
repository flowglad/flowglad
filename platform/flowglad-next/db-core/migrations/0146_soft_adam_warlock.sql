CREATE TABLE IF NOT EXISTS "ProductFeatures" (
	"id" text PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now(),
	"livemode" boolean NOT NULL,
	"OrganizationId" text NOT NULL,
	"label" text NOT NULL,
	"description" text NOT NULL,
	"key" text NOT NULL,
	CONSTRAINT "ProductFeatures_id_unique" UNIQUE("id")
);
--> statement-breakpoint
ALTER TABLE "ProductFeatures" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP INDEX IF EXISTS "Products_type_idx";--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProductFeatures" ADD CONSTRAINT "ProductFeatures_OrganizationId_Organizations_id_fk" FOREIGN KEY ("OrganizationId") REFERENCES "public"."Organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ProductFeatures_OrganizationId_idx" ON "ProductFeatures" USING btree ("OrganizationId");--> statement-breakpoint
ALTER TABLE "Products" DROP COLUMN IF EXISTS "type";--> statement-breakpoint
CREATE POLICY "Enable read for own organizations" ON "ProductFeatures" AS PERMISSIVE FOR ALL TO "authenticated" USING ("OrganizationId" in (select "OrganizationId" from "Memberships"));