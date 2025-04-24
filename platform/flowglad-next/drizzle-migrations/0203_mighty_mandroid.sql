ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "api_keys" ALTER COLUMN "unkey_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone;