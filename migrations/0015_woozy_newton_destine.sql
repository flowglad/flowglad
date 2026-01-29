ALTER TABLE "Testimonials" DROP CONSTRAINT "Testimonials_ProjectId_Projects_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "Testimonials_ProjectId_idx";--> statement-breakpoint
ALTER TABLE "Testimonials" DROP COLUMN IF EXISTS "ProjectId";