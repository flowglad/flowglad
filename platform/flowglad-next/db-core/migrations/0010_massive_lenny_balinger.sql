ALTER TABLE "Prices" RENAME TO "Variants";--> statement-breakpoint
ALTER TABLE "Deals" RENAME COLUMN "PriceId" TO "VariantId";--> statement-breakpoint
ALTER TABLE "Variants" RENAME COLUMN "isProjectPrice" TO "isProjectVariant";--> statement-breakpoint
ALTER TABLE "Variants" RENAME COLUMN "unitAmount" TO "unitPrice";--> statement-breakpoint
ALTER TABLE "Variants" DROP CONSTRAINT "Prices_externalId_unique";--> statement-breakpoint
ALTER TABLE "Variants" DROP CONSTRAINT "Prices_stripePriceId_unique";--> statement-breakpoint
ALTER TABLE "Deals" DROP CONSTRAINT "Deals_PriceId_Prices_id_fk";
--> statement-breakpoint
ALTER TABLE "Variants" DROP CONSTRAINT "Prices_ProductId_Products_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "Deals_PriceId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Prices_priceMode_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Prices_ProductId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Prices_stripePriceId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Products_priceMode_idx";--> statement-breakpoint
DO $$ BEGIN
    CREATE TYPE "productType" AS ENUM ('service', 'digital');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "Products" ADD COLUMN "type" "productType";--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Deals" ADD CONSTRAINT "Deals_VariantId_Variants_id_fk" FOREIGN KEY ("VariantId") REFERENCES "public"."Variants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Variants" ADD CONSTRAINT "Variants_ProductId_Products_id_fk" FOREIGN KEY ("ProductId") REFERENCES "public"."Products"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Deals_VariantId_idx" ON "Deals" USING btree ("VariantId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Variants_priceMode_idx" ON "Variants" USING btree ("priceMode");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Variants_ProductId_idx" ON "Variants" USING btree ("ProductId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Variants_stripePriceId_idx" ON "Variants" USING btree ("stripePriceId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Products_type_idx" ON "Products" USING btree ("type");--> statement-breakpoint
ALTER TABLE "Products" DROP COLUMN IF EXISTS "price";--> statement-breakpoint
ALTER TABLE "Products" DROP COLUMN IF EXISTS "priceMode";--> statement-breakpoint
ALTER TABLE "Variants" ADD CONSTRAINT "Variants_externalId_unique" UNIQUE("externalId");--> statement-breakpoint
ALTER TABLE "Variants" ADD CONSTRAINT "Variants_stripePriceId_unique" UNIQUE("stripePriceId");