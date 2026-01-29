DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='singular_quantity_label') THEN
        ALTER TABLE "products" ADD COLUMN "singular_quantity_label" text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='plural_quantity_label') THEN
        ALTER TABLE "products" ADD COLUMN "plural_quantity_label" text;
    END IF;
END $$;
ALTER TABLE "subscriptions" ADD COLUMN "plan_name" text;