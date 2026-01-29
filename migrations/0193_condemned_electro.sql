ALTER TABLE "organizations" ADD COLUMN "external_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "organizations_external_id_unique_idx" ON "organizations" USING btree ("external_id");--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_external_id_unique" UNIQUE("external_id");