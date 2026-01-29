DO $$ BEGIN
    CREATE TYPE "SubscriptionStatus" AS ENUM (
        'incomplete',
        'incomplete_expired', 
        'trialing',
        'active',
        'past_due',
        'canceled',
        'unpaid',
        'paused'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "PaymentMethods" (
	"id" text PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now(),
	"livemode" boolean DEFAULT true NOT NULL,
	"CustomerProfileId" text NOT NULL,
	"billingDetails" jsonb NOT NULL,
	"type" "PaymentMethodType" NOT NULL,
	"paymentMethodData" jsonb NOT NULL,
	"metadata" jsonb,
	"stripePaymentMethodId" text,
	CONSTRAINT "PaymentMethods_id_unique" UNIQUE("id")
);
--> statement-breakpoint
ALTER TABLE "PaymentMethods" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now(),
	"livemode" boolean DEFAULT true NOT NULL,
	"CustomerProfileId" text NOT NULL,
	"OrganizationId" text NOT NULL,
	"status" "SubscriptionStatus" NOT NULL,
	"defaultPaymentMethodId" text,
	"backupPaymentMethodId" text,
	"trialEnd" timestamp,
	"currentBillingPeriodStart" timestamp NOT NULL,
	"currentBillingPeriodEnd" timestamp NOT NULL,
	"metadata" jsonb,
	"endedAt" timestamp,
	"endScheduledAt" timestamp,
	"VariantId" text NOT NULL,
	"interval" "IntervalUnit" NOT NULL,
	"intervalCount" integer NOT NULL,
	"billingCycleAnchorDate" timestamp NOT NULL,
	CONSTRAINT "Subscriptions_id_unique" UNIQUE("id")
);
--> statement-breakpoint
ALTER TABLE "Subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "PaymentMethods" ADD CONSTRAINT "PaymentMethods_CustomerProfileId_CustomerProfiles_id_fk" FOREIGN KEY ("CustomerProfileId") REFERENCES "public"."CustomerProfiles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Subscriptions" ADD CONSTRAINT "Subscriptions_CustomerProfileId_CustomerProfiles_id_fk" FOREIGN KEY ("CustomerProfileId") REFERENCES "public"."CustomerProfiles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Subscriptions" ADD CONSTRAINT "Subscriptions_OrganizationId_Organizations_id_fk" FOREIGN KEY ("OrganizationId") REFERENCES "public"."Organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Subscriptions" ADD CONSTRAINT "Subscriptions_defaultPaymentMethodId_PaymentMethods_id_fk" FOREIGN KEY ("defaultPaymentMethodId") REFERENCES "public"."PaymentMethods"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Subscriptions" ADD CONSTRAINT "Subscriptions_backupPaymentMethodId_PaymentMethods_id_fk" FOREIGN KEY ("backupPaymentMethodId") REFERENCES "public"."PaymentMethods"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Subscriptions" ADD CONSTRAINT "Subscriptions_VariantId_Variants_id_fk" FOREIGN KEY ("VariantId") REFERENCES "public"."Variants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "PaymentMethods_CustomerProfileId_idx" ON "PaymentMethods" USING btree ("CustomerProfileId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "PaymentMethods_type_idx" ON "PaymentMethods" USING btree ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Subscriptions_CustomerProfileId_idx" ON "Subscriptions" USING btree ("CustomerProfileId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Subscriptions_VariantId_idx" ON "Subscriptions" USING btree ("VariantId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Subscriptions_status_idx" ON "Subscriptions" USING btree ("status");--> statement-breakpoint
CREATE POLICY "Enable read for own organizations via customer profiles" ON "PaymentMethods" AS PERMISSIVE FOR ALL TO "authenticated" USING ("CustomerProfileId" in (select "id" from "CustomerProfiles"));--> statement-breakpoint
CREATE POLICY "Check mode" ON "PaymentMethods" AS RESTRICTIVE FOR ALL TO "authenticated" USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
CREATE POLICY "Enable actions for own organizations via customer profiles" ON "Subscriptions" AS PERMISSIVE FOR ALL TO "authenticated" USING ("CustomerProfileId" in (select "id" from "CustomerProfiles"));--> statement-breakpoint
CREATE POLICY "Forbid deletion" ON "Subscriptions" AS RESTRICTIVE FOR DELETE TO "authenticated" USING (false);--> statement-breakpoint
CREATE POLICY "Check mode" ON "Subscriptions" AS RESTRICTIVE FOR ALL TO "authenticated" USING (current_setting('app.livemode')::boolean = livemode);