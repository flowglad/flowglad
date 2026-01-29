ALTER TABLE "api_keys" ADD COLUMN "stack_auth_hosted_billing_user_id" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "stack_auth_hosted_billing_user_id" text;
ALTER TYPE "apiKeyType" ADD VALUE IF NOT EXISTS 'hosted_billing_portal';