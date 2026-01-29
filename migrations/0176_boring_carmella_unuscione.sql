ALTER TABLE "customers" RENAME COLUMN "customer_tax_id" TO "tax_id";--> statement-breakpoint
DROP INDEX IF EXISTS "customers_slack_id_idx";--> statement-breakpoint
ALTER TABLE "catalogs" ADD COLUMN "is_default" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "catalog_id" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "catalog_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customers" ADD CONSTRAINT "customers_catalog_id_catalogs_id_fk" FOREIGN KEY ("catalog_id") REFERENCES "public"."catalogs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "products" ADD CONSTRAINT "products_catalog_id_catalogs_id_fk" FOREIGN KEY ("catalog_id") REFERENCES "public"."catalogs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customers_catalog_id_idx" ON "customers" USING btree ("catalog_id");--> statement-breakpoint
ALTER TABLE "customers" DROP COLUMN IF EXISTS "slack_id";

/*
 * Add constraint to ensure only one default catalog per organization and livemode.
 * 
 * This constraint works by:
 * 
 * 1. Using a btree-based exclusion constraint that prevents two rows from having the same:
 *    - organization_id
 *    - livemode
 *    - AND both having is_default = true
 * 
 * 2. The CASE expression is key: when is_default is true, it returns 1, but when false, it 
 *    returns NULL. Since NULL doesn't equal NULL in SQL comparison, this allows multiple 
 *    non-default catalogs to exist for the same organization_id and livemode.
 * 
 * 3. The constraint is DEFERRABLE INITIALLY DEFERRED, meaning it's only checked at the end
 *    of a transaction. This allows operations that temporarily create multiple default catalogs 
 *    within a transaction, as long as only one default remains when the transaction is committed.
 */
ALTER TABLE "catalogs"
ADD CONSTRAINT "catalogs_ensure_one_default_per_org"
EXCLUDE USING btree (
    organization_id WITH =,
    livemode WITH =,
    (CASE WHEN is_default THEN 1 ELSE NULL END) WITH =
) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "prices"
ADD CONSTRAINT "prices_ensure_one_default_per_product"
EXCLUDE USING btree (
    product_id WITH =,
    (CASE WHEN is_default THEN 1 ELSE NULL END) WITH =
) DEFERRABLE INITIALLY DEFERRED;
