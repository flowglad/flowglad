ALTER TABLE "customers" RENAME COLUMN "new_user_id" TO "user_id";--> statement-breakpoint
ALTER TABLE "memberships" RENAME COLUMN "new_user_id" TO "user_id";--> statement-breakpoint
ALTER TABLE "customers" DROP CONSTRAINT "customers_new_user_id_users_stack_auth_id_fk";
--> statement-breakpoint
ALTER TABLE "memberships" DROP CONSTRAINT "memberships_new_user_id_users_stack_auth_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "customers_new_user_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "memberships_new_user_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "memberships_new_user_id_organization_id_unique_idx";--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customers" ADD CONSTRAINT "customers_user_id_users_stack_auth_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("stack_auth_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_stack_auth_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("stack_auth_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customers_user_id_idx" ON "customers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memberships_user_id_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "memberships_user_id_organization_id_unique_idx" ON "memberships" USING btree ("user_id","organization_id");