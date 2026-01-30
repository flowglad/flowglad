DROP INDEX IF EXISTS "Countries_[object Object]_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Users_[object Object]_idx";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Countries_name_unique_idx" ON "Countries" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Countries_code_unique_idx" ON "Countries" USING btree ("code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Users_name_idx" ON "Users" USING btree ("name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Users_email_idx" ON "Users" USING btree ("email");