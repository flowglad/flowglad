ALTER TABLE "Products" ADD COLUMN "singular_quantity_label" text;--> statement-breakpoint
ALTER TABLE "Products" ADD COLUMN "plural_quantity_label" text;--> statement-breakpoint
ALTER TABLE "Products" DROP COLUMN IF EXISTS "quantity_label";