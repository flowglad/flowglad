DROP POLICY IF EXISTS "Enable read for own organizations" ON "memberships";--> statement-breakpoint
DROP POLICY IF EXISTS "Enable updates for organizations where you're a member" ON "organizations";--> statement-breakpoint
DROP POLICY IF EXISTS "Self-Read for Organizations by Memberships" ON "organizations";
DROP POLICY IF EXISTS "Enable read for own organizations" ON "proper_nouns";
DROP POLICY IF EXISTS "Allow update for organizations where you're a member" ON "organizations";

ALTER TABLE "customers" RENAME COLUMN "stack_auth_user_id" TO "new_user_id";--> statement-breakpoint
ALTER TABLE "memberships" RENAME COLUMN "stack_auth_user_id" TO "new_user_id";--> statement-breakpoint
ALTER TABLE "customers" DROP CONSTRAINT "customers_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "customers" DROP CONSTRAINT "customers_stack_auth_user_id_users_stack_auth_id_fk";
--> statement-breakpoint
ALTER TABLE "memberships" DROP CONSTRAINT "memberships_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "memberships" DROP CONSTRAINT "memberships_stack_auth_user_id_users_stack_auth_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "customers_user_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "memberships_user_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "memberships_user_id_organization_id_unique_idx";--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customers" ADD CONSTRAINT "customers_new_user_id_users_stack_auth_id_fk" FOREIGN KEY ("new_user_id") REFERENCES "public"."users"("stack_auth_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "memberships" ADD CONSTRAINT "memberships_new_user_id_users_stack_auth_id_fk" FOREIGN KEY ("new_user_id") REFERENCES "public"."users"("stack_auth_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customers_new_user_id_idx" ON "customers" USING btree ("new_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memberships_new_user_id_idx" ON "memberships" USING btree ("new_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "memberships_new_user_id_organization_id_unique_idx" ON "memberships" USING btree ("new_user_id","organization_id");--> statement-breakpoint
ALTER TABLE "customers" DROP COLUMN IF EXISTS "user_id";--> statement-breakpoint
ALTER TABLE "memberships" DROP COLUMN IF EXISTS "user_id";

CREATE POLICY "Self-Read for Organizations by Memberships" ON "organizations"
  FOR SELECT
  USING (id IN (
    SELECT "organization_id"
    FROM "memberships"
    WHERE "new_user_id" = requesting_user_id()
  ));

CREATE POLICY "Enable updates for organizations where you're a member" ON "organizations"
  FOR UPDATE
  USING (id IN (
    SELECT "organization_id"
    FROM "memberships"
    WHERE "new_user_id" = requesting_user_id()
  ));

CREATE POLICY "Enable read for own organizations" ON "memberships" 
    AS PERMISSIVE FOR SELECT TO "authenticated" USING ("new_user_id" = requesting_user_id());

CREATE POLICY "Enable read for own organizations" ON "proper_nouns"
    AS PERMISSIVE FOR SELECT TO "authenticated" USING ("organization_id" in (select "organization_id" from "memberships" where "new_user_id" = requesting_user_id()));

CREATE POLICY "Allow update for organizations where you're a member" ON "organizations"
  FOR UPDATE
  USING (id IN (
    SELECT "organization_id"
    FROM "memberships"
    WHERE "new_user_id" = requesting_user_id()
  ));
