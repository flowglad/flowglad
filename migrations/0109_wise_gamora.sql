ALTER TABLE "Organizations" ALTER COLUMN "stripeAccountId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "Organizations" ALTER COLUMN "domain" DROP NOT NULL;

-- Add the 'refunded' value to the PaymentStatus enum, needed for the next migration
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentStatus') THEN
    CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'completed', 'failed', 'refunded');
  ELSE
    ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'refunded';
  END IF;
END $$;