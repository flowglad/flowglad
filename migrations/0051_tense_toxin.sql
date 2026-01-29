ALTER TABLE "Testimonials" DROP CONSTRAINT IF EXISTS "Testimonials_formId_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "Testimonials_formId_unique_idx";--> statement-breakpoint
ALTER TABLE "Testimonials" ADD COLUMN "viewWorkURL" text;--> statement-breakpoint
ALTER TABLE "Testimonials" DROP COLUMN IF EXISTS "formId";--> statement-breakpoint
ALTER TABLE "Testimonials" DROP COLUMN IF EXISTS "testimonialText";