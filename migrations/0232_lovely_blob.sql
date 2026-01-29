ALTER TABLE "catalogs" RENAME TO "pricing_models";--> statement-breakpoint
ALTER TABLE "customers" RENAME COLUMN "catalog_id" TO "pricing_model_id";--> statement-breakpoint
ALTER TABLE "features" RENAME COLUMN "catalog_id" TO "pricing_model_id";--> statement-breakpoint
ALTER TABLE "products" RENAME COLUMN "catalog_id" TO "pricing_model_id";--> statement-breakpoint
ALTER TABLE "usage_meters" RENAME COLUMN "catalog_id" TO "pricing_model_id";--> statement-breakpoint
ALTER TABLE "pricing_models" RENAME CONSTRAINT "catalogs_id_unique" TO "pricing_models_id_unique";--> statement-breakpoint
ALTER TABLE "pricing_models" DROP CONSTRAINT "catalogs_organization_id_organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "customers" DROP CONSTRAINT "customers_catalog_id_catalogs_id_fk";
--> statement-breakpoint
ALTER TABLE "features" DROP CONSTRAINT "features_catalog_id_catalogs_id_fk";
--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT "products_catalog_id_catalogs_id_fk";
--> statement-breakpoint
ALTER TABLE "usage_meters" DROP CONSTRAINT "usage_meters_catalog_id_catalogs_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "catalogs_organization_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "catalogs_name_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "customers_catalog_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "features_organization_id_slug_catalog_id_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "features_catalog_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "products_catalog_id_slug_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "products_catalog_id_default_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "usage_meters_catalog_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "usage_meters_organization_id_slug_catalog_id_unique_idx";--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pricing_models" ADD CONSTRAINT "pricing_models_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customers" ADD CONSTRAINT "customers_pricing_model_id_pricing_models_id_fk" FOREIGN KEY ("pricing_model_id") REFERENCES "public"."pricing_models"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "features" ADD CONSTRAINT "features_pricing_model_id_pricing_models_id_fk" FOREIGN KEY ("pricing_model_id") REFERENCES "public"."pricing_models"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "products" ADD CONSTRAINT "products_pricing_model_id_pricing_models_id_fk" FOREIGN KEY ("pricing_model_id") REFERENCES "public"."pricing_models"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "usage_meters" ADD CONSTRAINT "usage_meters_pricing_model_id_pricing_models_id_fk" FOREIGN KEY ("pricing_model_id") REFERENCES "public"."pricing_models"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pricing_models_organization_id_idx" ON "pricing_models" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pricing_models_name_idx" ON "pricing_models" USING btree ("name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customers_pricing_model_id_idx" ON "customers" USING btree ("pricing_model_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "features_organization_id_slug_pricing_model_id_unique_idx" ON "features" USING btree ("organization_id","slug","pricing_model_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "features_pricing_model_id_idx" ON "features" USING btree ("pricing_model_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "products_pricing_model_id_slug_unique_idx" ON "products" USING btree ("pricing_model_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "products_pricing_model_id_default_unique_idx" ON "products" USING btree ("pricing_model_id") WHERE "products"."default";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_meters_pricing_model_id_idx" ON "usage_meters" USING btree ("pricing_model_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "usage_meters_organization_id_slug_pricing_model_id_unique_idx" ON "usage_meters" USING btree ("organization_id","slug","pricing_model_id");--> statement-breakpoint

-- Ensure price slug uniqueness scoped to pricing model (renamed from catalogs)
CREATE OR REPLACE FUNCTION enforce_price_slug_unique() RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
AS $$
DECLARE 
    pm text;
    cnt int;
BEGIN
    SELECT pricing_model_id INTO pm
    FROM products
    WHERE id = NEW.product_id;
    SELECT COUNT(*) INTO cnt
    FROM prices p
    JOIN products pr ON pr.id = p.product_id
    WHERE pr.pricing_model_id = pm
    AND p.slug = NEW.slug
    AND (TG_OP = 'INSERT' OR p.id <> OLD.id);
    IF cnt > 0 THEN
    RAISE EXCEPTION 'duplicate slug "%" in pricing model %', NEW.slug, pm;
    END IF;
    RETURN NEW;
END;
$$;--> statement-breakpoint

