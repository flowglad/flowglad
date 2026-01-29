DROP POLICY "Check mode" ON "Organizations" CASCADE;
ALTER TABLE "Organizations" DROP COLUMN IF EXISTS "livemode";--> statement-breakpoint
