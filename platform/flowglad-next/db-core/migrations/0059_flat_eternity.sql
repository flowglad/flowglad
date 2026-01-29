ALTER TABLE IF EXISTS "Projects" RENAME TO "Purchases";--> statement-breakpoint
ALTER TABLE IF EXISTS "Invoices" RENAME COLUMN "ProjectId" TO "PurchaseId";--> statement-breakpoint
ALTER TABLE IF EXISTS "Purchases" RENAME COLUMN "totalProjectValue" TO "totalPurchaseValue";--> statement-breakpoint
ALTER TABLE IF EXISTS "Purchases" DROP CONSTRAINT IF EXISTS "Projects_externalId_unique";--> statement-breakpoint
ALTER TABLE IF EXISTS "Purchases" DROP CONSTRAINT IF EXISTS "Projects_stripeSubscriptionId_unique";--> statement-breakpoint
ALTER TABLE IF EXISTS "Purchases" DROP CONSTRAINT IF EXISTS "Projects_stripePaymentIntentId_unique";--> statement-breakpoint
ALTER TABLE IF EXISTS "Invoices" DROP CONSTRAINT IF EXISTS "Invoices_ProjectId_Projects_id_fk";
--> statement-breakpoint
ALTER TABLE IF EXISTS "Purchases" DROP CONSTRAINT IF EXISTS "Projects_CustomerProfileId_CustomerProfiles_id_fk";
--> statement-breakpoint
ALTER TABLE IF EXISTS "Purchases" DROP CONSTRAINT IF EXISTS "Projects_OrganizationId_Organizations_id_fk";
--> statement-breakpoint
ALTER TABLE IF EXISTS "Purchases" DROP CONSTRAINT IF EXISTS "Projects_VariantId_Variants_id_fk";
--> statement-breakpoint
ALTER TABLE IF EXISTS "Purchases" DROP CONSTRAINT IF EXISTS "Projects_TermId_Terms_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "Invoices_ProjectId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Projects_CustomerProfileId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Projects_OrganizationId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Projects_VariantId_idx";--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE IF EXISTS "Invoices" ADD CONSTRAINT "Invoices_PurchaseId_Purchases_id_fk" FOREIGN KEY ("PurchaseId") REFERENCES "public"."Purchases"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE IF EXISTS "Purchases" ADD CONSTRAINT "Purchases_CustomerProfileId_CustomerProfiles_id_fk" FOREIGN KEY ("CustomerProfileId") REFERENCES "public"."CustomerProfiles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE IF EXISTS "Purchases" ADD CONSTRAINT "Purchases_OrganizationId_Organizations_id_fk" FOREIGN KEY ("OrganizationId") REFERENCES "public"."Organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE IF EXISTS "Purchases" ADD CONSTRAINT "Purchases_VariantId_Variants_id_fk" FOREIGN KEY ("VariantId") REFERENCES "public"."Variants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE IF EXISTS "Purchases" ADD CONSTRAINT "Purchases_TermId_Terms_id_fk" FOREIGN KEY ("TermId") REFERENCES "public"."Terms"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Invoices_PurchaseId_idx" ON "Invoices" USING btree ("PurchaseId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Purchases_CustomerProfileId_idx" ON "Purchases" USING btree ("CustomerProfileId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Purchases_OrganizationId_idx" ON "Purchases" USING btree ("OrganizationId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Purchases_VariantId_idx" ON "Purchases" USING btree ("VariantId");--> statement-breakpoint
ALTER TABLE IF EXISTS "Purchases" ADD CONSTRAINT "Purchases_externalId_unique" UNIQUE("externalId");--> statement-breakpoint
ALTER TABLE IF EXISTS "Purchases" ADD CONSTRAINT "Purchases_stripeSubscriptionId_unique" UNIQUE("stripeSubscriptionId");--> statement-breakpoint
ALTER TABLE IF EXISTS "Purchases" ADD CONSTRAINT "Purchases_stripePaymentIntentId_unique" UNIQUE("stripePaymentIntentId");

DO $$ BEGIN
    CREATE TYPE "PurchaseSessionStatus" AS ENUM ('open', 'succeeded', 'failed', 'expired');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "PurchaseSessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now(),
	"externalId" text NOT NULL,
	"status" "PurchaseSessionStatus" NOT NULL,
	"billingAddress" jsonb,
	"VariantId" integer NOT NULL,
	"stripePaymentIntentId" text,
	CONSTRAINT "PurchaseSessions_externalId_unique" UNIQUE("externalId")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "PurchaseSessions" ADD CONSTRAINT "PurchaseSessions_VariantId_Variants_id_fk" FOREIGN KEY ("VariantId") REFERENCES "public"."Variants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "PurchaseSessions_VariantId_idx" ON "PurchaseSessions" USING btree ("VariantId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "PurchaseSessions_stripePaymentIntentId_idx" ON "PurchaseSessions" USING btree ("stripePaymentIntentId");