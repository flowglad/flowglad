ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "cancellation_reason" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "replaced_by_subscription_id" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "is_free_plan" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "is_free_plan" SET DEFAULT false;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriptions_replaced_by_subscription_id_idx" ON "subscriptions" USING btree ("replaced_by_subscription_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriptions_is_free_plan_idx" ON "subscriptions" USING btree ("is_free_plan");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriptions_cancellation_reason_idx" ON "subscriptions" USING btree ("cancellation_reason") WHERE "cancellation_reason" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriptions_organization_id_idx" ON "subscriptions" USING btree ("organization_id");