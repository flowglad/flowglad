DROP POLICY "Enable all for own forms" ON "form_fields" CASCADE;--> statement-breakpoint
DROP POLICY "Check mode" ON "form_fields" CASCADE;--> statement-breakpoint
DROP TABLE "form_fields" CASCADE;--> statement-breakpoint
DROP POLICY "Enable all for own organizations" ON "forms" CASCADE;--> statement-breakpoint
DROP POLICY "Check mode" ON "forms" CASCADE;--> statement-breakpoint
DROP TABLE "forms" CASCADE;--> statement-breakpoint
DROP POLICY IF EXISTS "Enable all for own forms" ON "form_submissions" CASCADE;--> statement-breakpoint
DROP POLICY "Check mode" ON "form_submissions" CASCADE;--> statement-breakpoint
DROP TABLE "form_submissions" CASCADE;--> statement-breakpoint
DROP POLICY "Enable read for own organizations" ON "integrations" CASCADE;--> statement-breakpoint
DROP POLICY "Check mode" ON "integrations" CASCADE;--> statement-breakpoint
DROP TABLE "integrations" CASCADE;--> statement-breakpoint
DROP TABLE "integration_sessions" CASCADE;--> statement-breakpoint
ALTER TABLE "Customers" ADD COLUMN "stack_auth_id" text;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "stack_auth_user_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "stack_auth_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_stack_auth_id_unique" UNIQUE("stack_auth_id");