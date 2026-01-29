CREATE TABLE IF NOT EXISTS "BillingPeriodItems" (
	"id" text PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now(),
	"livemode" boolean DEFAULT true NOT NULL,
	"BillingPeriodId" text NOT NULL,
	"quantity" integer NOT NULL,
	"unitPrice" integer NOT NULL,
	"name" text NOT NULL,
	"SubscriptionItemId" text,
	"DiscountRedemptionId" text,
	"description" text NOT NULL,
	CONSTRAINT "BillingPeriodItems_id_unique" UNIQUE("id")
);
--> statement-breakpoint
ALTER TABLE "BillingPeriodItems" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
    CREATE TYPE "BillingPeriodStatus" AS ENUM ('upcoming', 'active', 'completed', 'failed', 'canceled', 'past_due');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "InvoiceType" AS ENUM ('purchase', 'subscription');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;


DO $$ BEGIN
    CREATE TYPE "FeeCalculationType" AS ENUM ('subscription_payment', 'purchase_session_payment');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'awaiting_payment_confirmation';

DO $$ BEGIN
    CREATE TYPE "BillingRunStatus" AS ENUM ('scheduled', 'started', 'awaiting_payment_confirmation', 'succeeded', 'failed', 'abandoned', 'aborted');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;


CREATE TABLE IF NOT EXISTS "BillingPeriods" (
	"id" text PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now(),
	"livemode" boolean DEFAULT true NOT NULL,
	"SubscriptionId" text NOT NULL,
	"startDate" timestamp NOT NULL,
	"endDate" timestamp NOT NULL,
	"status" "BillingPeriodStatus",
	CONSTRAINT "BillingPeriods_id_unique" UNIQUE("id")
);
--> statement-breakpoint
ALTER TABLE "BillingPeriods" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "BillingRuns" (
	"id" text PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now(),
	"livemode" boolean DEFAULT true NOT NULL,
	"BillingPeriodId" text NOT NULL,
	"scheduledFor" timestamp NOT NULL,
	"startedAt" timestamp,
	"completedAt" timestamp,
	"status" "BillingRunStatus" NOT NULL,
	"attemptNumber" integer DEFAULT 1 NOT NULL,
	"errorDetails" jsonb,
	"SubscriptionId" text NOT NULL,
	"PaymentMethodId" text NOT NULL,
	CONSTRAINT "BillingRuns_id_unique" UNIQUE("id")
);
--> statement-breakpoint
ALTER TABLE "BillingRuns" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "SubscriptionItems" (
	"id" text PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now(),
	"livemode" boolean DEFAULT true NOT NULL,
	"SubscriptionId" text NOT NULL,
	"addedDate" timestamp NOT NULL,
	"removedDate" timestamp,
	"VariantId" text NOT NULL,
	"unitPrice" integer NOT NULL,
	"quantity" integer NOT NULL,
	"metadata" jsonb,
	CONSTRAINT "SubscriptionItems_id_unique" UNIQUE("id")
);
--> statement-breakpoint

ALTER TABLE "SubscriptionItems" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "FeeCalculations" ALTER COLUMN "PurchaseSessionId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "FeeCalculations" ALTER COLUMN "VariantId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "Invoices" ALTER COLUMN "PurchaseId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "FeeCalculations" ADD COLUMN "BillingPeriodId" text;--> statement-breakpoint
ALTER TABLE "FeeCalculations" ADD COLUMN "type" "FeeCalculationType";--> statement-breakpoint
ALTER TABLE "Invoices" ADD COLUMN "BillingPeriodId" text;--> statement-breakpoint
ALTER TABLE "Invoices" ADD COLUMN "billingPeriodStartDate" timestamp;--> statement-breakpoint
ALTER TABLE "Invoices" ADD COLUMN "billingPeriodEndDate" timestamp;--> statement-breakpoint
ALTER TABLE "Invoices" ADD COLUMN "type" "InvoiceType";--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "BillingPeriodItems" ADD CONSTRAINT "BillingPeriodItems_BillingPeriodId_BillingPeriods_id_fk" FOREIGN KEY ("BillingPeriodId") REFERENCES "public"."BillingPeriods"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "BillingPeriodItems" ADD CONSTRAINT "BillingPeriodItems_SubscriptionItemId_SubscriptionItems_id_fk" FOREIGN KEY ("SubscriptionItemId") REFERENCES "public"."SubscriptionItems"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "BillingPeriodItems" ADD CONSTRAINT "BillingPeriodItems_DiscountRedemptionId_DiscountRedemptions_id_fk" FOREIGN KEY ("DiscountRedemptionId") REFERENCES "public"."DiscountRedemptions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "BillingPeriods" ADD CONSTRAINT "BillingPeriods_SubscriptionId_Subscriptions_id_fk" FOREIGN KEY ("SubscriptionId") REFERENCES "public"."Subscriptions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "BillingRuns" ADD CONSTRAINT "BillingRuns_BillingPeriodId_BillingPeriods_id_fk" FOREIGN KEY ("BillingPeriodId") REFERENCES "public"."BillingPeriods"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "BillingRuns" ADD CONSTRAINT "BillingRuns_SubscriptionId_Subscriptions_id_fk" FOREIGN KEY ("SubscriptionId") REFERENCES "public"."Subscriptions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "BillingRuns" ADD CONSTRAINT "BillingRuns_PaymentMethodId_PaymentMethods_id_fk" FOREIGN KEY ("PaymentMethodId") REFERENCES "public"."PaymentMethods"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "SubscriptionItems" ADD CONSTRAINT "SubscriptionItems_SubscriptionId_Subscriptions_id_fk" FOREIGN KEY ("SubscriptionId") REFERENCES "public"."Subscriptions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "SubscriptionItems" ADD CONSTRAINT "SubscriptionItems_VariantId_Variants_id_fk" FOREIGN KEY ("VariantId") REFERENCES "public"."Variants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "BillingPeriodItems_BillingPeriodId_idx" ON "BillingPeriodItems" USING btree ("BillingPeriodId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "BillingPeriodItems_SubscriptionItemId_idx" ON "BillingPeriodItems" USING btree ("SubscriptionItemId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "BillingPeriodItems_DiscountRedemptionId_idx" ON "BillingPeriodItems" USING btree ("DiscountRedemptionId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "BillingPeriods_SubscriptionId_idx" ON "BillingPeriods" USING btree ("SubscriptionId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "BillingPeriods_status_idx" ON "BillingPeriods" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "BillingRuns_BillingPeriodId_idx" ON "BillingRuns" USING btree ("BillingPeriodId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "BillingRuns_status_idx" ON "BillingRuns" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "SubscriptionItems_SubscriptionId_idx" ON "SubscriptionItems" USING btree ("SubscriptionId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "SubscriptionItems_VariantId_idx" ON "SubscriptionItems" USING btree ("VariantId");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "FeeCalculations" ADD CONSTRAINT "FeeCalculations_BillingPeriodId_BillingPeriods_id_fk" FOREIGN KEY ("BillingPeriodId") REFERENCES "public"."BillingPeriods"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Invoices" ADD CONSTRAINT "Invoices_BillingPeriodId_BillingPeriods_id_fk" FOREIGN KEY ("BillingPeriodId") REFERENCES "public"."BillingPeriods"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE POLICY "Enable read for own organizations" ON "BillingPeriodItems" AS PERMISSIVE FOR ALL TO "authenticated" USING ("BillingPeriodId" in (select "id" from "BillingPeriods" where "SubscriptionId" in (select "id" from "Subscriptions" where "OrganizationId" in (select "OrganizationId" from "Memberships"))));--> statement-breakpoint
CREATE POLICY "Enable read for own organizations" ON "BillingPeriods" AS PERMISSIVE FOR ALL TO "authenticated" USING ("SubscriptionId" in (select "id" from "Subscriptions" where "OrganizationId" in (select "OrganizationId" from "Memberships")));--> statement-breakpoint
CREATE POLICY "Enable read for own organizations" ON "BillingRuns" AS PERMISSIVE FOR ALL TO "authenticated" USING ("BillingPeriodId" in (select "id" from "BillingPeriods" where "SubscriptionId" in (select "id" from "Subscriptions" where "OrganizationId" in (select "OrganizationId" from "Memberships"))));--> statement-breakpoint
CREATE POLICY "Enable actions for own organizations via subscriptions" ON "SubscriptionItems" AS PERMISSIVE FOR ALL TO "authenticated" USING ("SubscriptionId" in (select "id" from "Subscriptions"));--> statement-breakpoint
CREATE POLICY "Check mode" ON "SubscriptionItems" AS RESTRICTIVE FOR ALL TO "authenticated" USING (current_setting('app.livemode')::boolean = livemode);