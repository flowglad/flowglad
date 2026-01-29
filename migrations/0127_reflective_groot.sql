ALTER TABLE "Organizations" ALTER COLUMN "stripeConnectContractType" SET DEFAULT 'platform';--> statement-breakpoint
ALTER TABLE "Organizations" ALTER COLUMN "stripeConnectContractType" SET NOT NULL;