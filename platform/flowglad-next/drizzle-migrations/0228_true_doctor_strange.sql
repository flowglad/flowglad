CREATE TABLE IF NOT EXISTS "better_auth_account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "better_auth_session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "better_auth_session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "better_auth_user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"email_verified" boolean NOT NULL,
	"image" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "better_auth_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "better_auth_verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD COLUMN "better_auth_id" text;
EXCEPTION
 WHEN duplicate_column THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD COLUMN "stack_auth_id" text;
EXCEPTION
 WHEN duplicate_column THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "better_auth_account" ADD CONSTRAINT "better_auth_account_user_id_better_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."better_auth_user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "better_auth_session" ADD CONSTRAINT "better_auth_session_user_id_better_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."better_auth_user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM pg_constraint 
   WHERE conname = 'users_better_auth_id_unique'
 ) THEN
   ALTER TABLE "users" ADD CONSTRAINT "users_better_auth_id_unique" UNIQUE("better_auth_id");
 END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM pg_constraint 
   WHERE conname = 'users_stack_auth_id_unique'
 ) THEN
   ALTER TABLE "users" ADD CONSTRAINT "users_stack_auth_id_unique" UNIQUE("stack_auth_id");
 END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "better_auth_user" ADD COLUMN "role" text NOT NULL DEFAULT 'user';
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

ALTER TABLE "better_auth_account" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "better_auth_session" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "better_auth_user" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "better_auth_verification" ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION current_organization_id()
RETURNS TEXT
LANGUAGE SQL
STABLE
AS $$
    SELECT NULLIF(((current_setting('request.jwt.claims', true))::json)->>'organization_id', '');
$$;