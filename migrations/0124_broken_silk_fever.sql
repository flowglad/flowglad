DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'apiKeyType') THEN
        CREATE TYPE "apiKeyType" AS ENUM ('publishable', 'secret');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name='ApiKeys' 
        AND column_name='type'
    ) THEN
        ALTER TABLE "ApiKeys" ADD COLUMN "type" "apiKeyType";
    END IF;
END $$;

