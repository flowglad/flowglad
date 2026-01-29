ALTER TABLE "Products" RENAME COLUMN "isActive" TO "active";--> statement-breakpoint
DROP INDEX IF EXISTS "Products_isActive_idx";--> statement-breakpoint
ALTER TABLE "Products" ALTER COLUMN "active" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "Products" ALTER COLUMN "active" SET NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Products_active_idx" ON "Products" USING btree ("active");