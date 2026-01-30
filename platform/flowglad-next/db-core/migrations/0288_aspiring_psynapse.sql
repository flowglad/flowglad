CREATE TABLE IF NOT EXISTS "better_auth_device_code" (
	"id" text PRIMARY KEY NOT NULL,
	"device_code" text NOT NULL,
	"user_code" text NOT NULL,
	"user_id" text,
	"client_id" text,
	"scope" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"last_polled_at" timestamp,
	"polling_interval" integer,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "better_auth_device_code_device_code_unique" UNIQUE("device_code"),
	CONSTRAINT "better_auth_device_code_user_code_unique" UNIQUE("user_code")
);
--> statement-breakpoint
ALTER TABLE "better_auth_device_code" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "better_auth_device_code" ADD CONSTRAINT "better_auth_device_code_user_id_better_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."better_auth_user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
