ALTER TABLE "checkout_sessions" ADD COLUMN "output_metadata" jsonb;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "metadata" jsonb;