DO $$ BEGIN
 CREATE TYPE "public"."session_scope" AS ENUM('merchant', 'customer');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "better_auth_session" ADD COLUMN "scope" "session_scope" DEFAULT 'merchant' NOT NULL;--> statement-breakpoint
ALTER TABLE "better_auth_session" ADD COLUMN "context_organization_id" text;
