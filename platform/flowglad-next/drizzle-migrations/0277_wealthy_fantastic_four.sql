ALTER TABLE "resource_claims" ADD COLUMN "expired_at" timestamptz;--> statement-breakpoint
ALTER TABLE "resource_claims" DROP COLUMN IF EXISTS "expires_at";