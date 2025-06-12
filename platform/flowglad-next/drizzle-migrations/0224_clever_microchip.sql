DROP INDEX IF EXISTS "features_organization_id_slug_unique_idx";--> statement-breakpoint
ALTER TABLE "features" ADD COLUMN "catalog_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "features" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_meters" ADD COLUMN "slug" text;--> statement-breakpoint
UPDATE "usage_meters" SET "slug" = LOWER(REGEXP_REPLACE(REGEXP_REPLACE("name", '([A-Z])', '_\1'), '[\s-]+', '_', 'g'));
ALTER TABLE "usage_meters" ALTER COLUMN "slug" SET NOT NULL;

DO $$ BEGIN
 ALTER TABLE "features" ADD CONSTRAINT "features_catalog_id_catalogs_id_fk" FOREIGN KEY ("catalog_id") REFERENCES "public"."catalogs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "features_organization_id_slug_catalog_id_unique_idx" ON "features" USING btree ("organization_id","slug","catalog_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "features_catalog_id_idx" ON "features" USING btree ("catalog_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "usage_meters_organization_id_slug_catalog_id_unique_idx" ON "usage_meters" USING btree ("organization_id","slug","catalog_id");