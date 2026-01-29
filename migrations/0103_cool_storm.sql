ALTER TABLE "FeeCalculations" ALTER COLUMN "discountAmountFixed" SET NOT NULL;

DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Invoices' AND column_name = 'externalId') THEN
        ALTER TABLE "Invoices" ALTER COLUMN "externalId" DROP NOT NULL;
    END IF;
END $$;

ALTER TABLE "Invoices" DROP COLUMN IF EXISTS "externalId";

ALTER TABLE "InvoiceLineItems" DROP COLUMN IF EXISTS "externalId";
