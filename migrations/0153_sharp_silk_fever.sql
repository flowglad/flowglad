DO $$ BEGIN
    ALTER TYPE "PurchaseSessionStatus" ADD VALUE IF NOT EXISTS 'pending';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "PurchaseSessions" ALTER COLUMN "VariantId" DROP NOT NULL;--> statement-breakpoint
DO $$ BEGIN
    CREATE TYPE "PurchaseSessionType" AS ENUM ('product', 'purchase', 'invoice', 'add_payment_method');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "PurchaseSessions" ADD COLUMN "type" "PurchaseSessionType";

UPDATE "PurchaseSessions" SET "type" = 'product';

ALTER TABLE "PurchaseSessions" ALTER COLUMN "type" SET NOT NULL;

DO $$ BEGIN
    ALTER TYPE "InvoiceType" ADD VALUE IF NOT EXISTS 'standalone';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
