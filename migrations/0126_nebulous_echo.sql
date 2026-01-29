DO $$ BEGIN
    CREATE TYPE "StripeConnectContractType" AS ENUM ('merchant_of_record', 'platform');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "Organizations" ADD COLUMN "stripeConnectContractType" "StripeConnectContractType";

-- do this for the existing organizations to map them into the old regime
UPDATE "Organizations" SET "stripeConnectContractType" = 'merchant_of_record';
