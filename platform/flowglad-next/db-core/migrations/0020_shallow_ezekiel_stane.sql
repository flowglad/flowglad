DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'IntervalUnit') THEN
        CREATE TYPE "IntervalUnit" AS ENUM ('day', 'week', 'month', 'year');
    END IF;
END $$;
ALTER TABLE "Variants" ADD COLUMN "intervalUnit" "IntervalUnit";--> statement-breakpoint
ALTER TABLE "Variants" DROP COLUMN IF EXISTS "interval";