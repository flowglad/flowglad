ALTER TABLE "usage_meters" ADD COLUMN "product_id" text NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_meters_product_id_idx" ON "usage_meters" USING btree ("product_id");