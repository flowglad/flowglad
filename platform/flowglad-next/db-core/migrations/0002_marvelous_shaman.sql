ALTER TABLE "Test" ADD COLUMN "createdAt" timestamp DEFAULT now();--> statement-breakpoint
ALTER TABLE "Test" ADD COLUMN "updatedAt" timestamp DEFAULT now();--> statement-breakpoint
ALTER TABLE "Test" ADD COLUMN "externalId" text;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Countries_externalId_unique') THEN
        ALTER TABLE "Test" ADD CONSTRAINT "Countries_externalId_unique" UNIQUE("externalId");
    END IF;
END $$;