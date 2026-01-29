DO $$ BEGIN
    CREATE TYPE "PurchaseStatus" AS ENUM ('pending', 'failed', 'paid', 'refunded', 'partial_refund', 'fraudulent', 'open');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;


ALTER TABLE "Purchases" ADD COLUMN IF NOT EXISTS "purchaseStatus" "PurchaseStatus" DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "PurchaseSessions" ADD COLUMN IF NOT EXISTS "OrganizationId" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "PurchaseSessions" ADD COLUMN IF NOT EXISTS "customerName" text;--> statement-breakpoint
ALTER TABLE "PurchaseSessions" ADD COLUMN IF NOT EXISTS "customerEmail" text;--> statement-breakpoint
ALTER TABLE "PurchaseSessions" ADD COLUMN IF NOT EXISTS "stripeSetupIntentId" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "PurchaseSessions" ADD CONSTRAINT "PurchaseSessions_OrganizationId_Organizations_id_fk" FOREIGN KEY ("OrganizationId") REFERENCES "public"."Organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
