ALTER TABLE "Organizations" RENAME COLUMN "digitalFeePercentage" TO "feePercentage";--> statement-breakpoint
ALTER TABLE "Organizations" DROP COLUMN IF EXISTS "serviceFeePercentage";