ALTER TABLE "Events" ALTER COLUMN "subjectEntity" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "Events" ALTER COLUMN "subjectId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "Events" ALTER COLUMN "OrganizationId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "Events" ADD COLUMN "hash" text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Events_hash_unique_idx" ON "Events" USING btree ("hash");--> statement-breakpoint
ALTER TABLE "Events" ADD CONSTRAINT "Events_hash_unique" UNIQUE("hash");--> statement-breakpoint
CREATE POLICY "Enable read for own organizations" ON "Memberships" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("UserId" = requesting_user_id());