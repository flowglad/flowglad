ALTER TABLE "ApiKeys" ADD COLUMN "token" text NOT NULL;--> statement-breakpoint
ALTER TABLE "ApiKeys" DROP COLUMN IF EXISTS "encryptedKey";