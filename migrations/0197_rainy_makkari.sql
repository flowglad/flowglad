ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "failure_message" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "failure_code" text;--> statement-breakpoint
ALTER TABLE "checkout_sessions" ADD COLUMN IF NOT EXISTS "target_subscription_id" text;