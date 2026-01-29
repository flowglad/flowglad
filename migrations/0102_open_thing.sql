DO $$ BEGIN
    CREATE TYPE "PaymentMethodType" AS ENUM ('card', 'us_bank_account', 'sepa_debit', 'link');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "FeeCalculations" (
	"id" text PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now(),
	"OrganizationId" text NOT NULL,
	"PurchaseSessionId" text NOT NULL,
	"PurchaseId" text,
	"DiscountId" text,
	"VariantId" text NOT NULL,
	"paymentMethodType" "PaymentMethodType" NOT NULL,
	"discountAmountFixed" integer,
	"paymentMethodFeeFixed" integer NOT NULL,
	"baseAmount" integer NOT NULL,
	"internationalFeePercentage" text NOT NULL,
	"flowgladFeePercentage" text NOT NULL,
	"billingAddress" jsonb NOT NULL,
	"taxAmountFixed" integer NOT NULL,
	"pretaxTotal" integer NOT NULL,
	"stripeTaxCalculationId" text NOT NULL,
	"stripeTaxTransactionId" text,
	CONSTRAINT "FeeCalculations_id_unique" UNIQUE("id")
);
--> statement-breakpoint
ALTER TABLE "FeeCalculations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "Payments" DROP COLUMN IF EXISTS "externalId";--> statement-breakpoint
ALTER TABLE "Organizations" ADD COLUMN "serviceFeePercentage" text DEFAULT '1.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "Organizations" ADD COLUMN "digitalFeePercentage" text DEFAULT '3.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "PurchaseSessions" ADD COLUMN "paymentMethodType" "PaymentMethodType";--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "FeeCalculations" ADD CONSTRAINT "FeeCalculations_OrganizationId_Organizations_id_fk" FOREIGN KEY ("OrganizationId") REFERENCES "public"."Organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "FeeCalculations" ADD CONSTRAINT "FeeCalculations_PurchaseSessionId_PurchaseSessions_id_fk" FOREIGN KEY ("PurchaseSessionId") REFERENCES "public"."PurchaseSessions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "FeeCalculations" ADD CONSTRAINT "FeeCalculations_PurchaseId_Purchases_id_fk" FOREIGN KEY ("PurchaseId") REFERENCES "public"."Purchases"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "FeeCalculations" ADD CONSTRAINT "FeeCalculations_DiscountId_Discounts_id_fk" FOREIGN KEY ("DiscountId") REFERENCES "public"."Discounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "FeeCalculations" ADD CONSTRAINT "FeeCalculations_VariantId_Variants_id_fk" FOREIGN KEY ("VariantId") REFERENCES "public"."Variants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "FeeCalculations_OrganizationId_idx" ON "FeeCalculations" USING btree ("OrganizationId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "FeeCalculations_PurchaseSessionId_idx" ON "FeeCalculations" USING btree ("PurchaseSessionId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "FeeCalculations_PurchaseId_idx" ON "FeeCalculations" USING btree ("PurchaseId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "FeeCalculations_DiscountId_idx" ON "FeeCalculations" USING btree ("DiscountId");--> statement-breakpoint
ALTER TABLE "Purchases" DROP COLUMN IF EXISTS "taxAmount";--> statement-breakpoint
ALTER TABLE "Purchases" DROP COLUMN IF EXISTS "stripeTaxCalculationId";--> statement-breakpoint
ALTER TABLE "PurchaseSessions" DROP COLUMN IF EXISTS "stripeTaxCalculationId";--> statement-breakpoint
CREATE POLICY "Enable select for own organization" ON "FeeCalculations" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("OrganizationId" in (select "OrganizationId" from "Memberships"));