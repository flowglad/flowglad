ALTER TABLE "ApiKeys" RENAME COLUMN "OrganizationId" TO "organization_id";--> statement-breakpoint
ALTER TABLE "ApiKeys" RENAME COLUMN "unkeyId" TO "unkey_id";--> statement-breakpoint
ALTER TABLE "BillingPeriodItems" RENAME COLUMN "BillingPeriodId" TO "billing_period_id";--> statement-breakpoint
ALTER TABLE "BillingPeriodItems" RENAME COLUMN "unitPrice" TO "unit_price";--> statement-breakpoint
ALTER TABLE "BillingPeriodItems" RENAME COLUMN "DiscountRedemptionId" TO "discount_redemption_id";--> statement-breakpoint
ALTER TABLE "BillingPeriods" RENAME COLUMN "SubscriptionId" TO "subscription_id";--> statement-breakpoint
ALTER TABLE "BillingPeriods" RENAME COLUMN "startDate" TO "start_date";--> statement-breakpoint
ALTER TABLE "BillingPeriods" RENAME COLUMN "endDate" TO "end_date";--> statement-breakpoint
ALTER TABLE "BillingPeriods" RENAME COLUMN "trialPeriod" TO "trial_period";--> statement-breakpoint
ALTER TABLE "BillingRuns" RENAME COLUMN "BillingPeriodId" TO "billing_period_id";--> statement-breakpoint
ALTER TABLE "BillingRuns" RENAME COLUMN "scheduledFor" TO "scheduled_for";--> statement-breakpoint
ALTER TABLE "BillingRuns" RENAME COLUMN "startedAt" TO "started_at";--> statement-breakpoint
ALTER TABLE "BillingRuns" RENAME COLUMN "completedAt" TO "completed_at";--> statement-breakpoint
ALTER TABLE "BillingRuns" RENAME COLUMN "stripePaymentIntentId" TO "stripe_payment_intent_id";--> statement-breakpoint
ALTER TABLE "BillingRuns" RENAME COLUMN "attemptNumber" TO "attempt_number";--> statement-breakpoint
ALTER TABLE "BillingRuns" RENAME COLUMN "errorDetails" TO "error_details";--> statement-breakpoint
ALTER TABLE "BillingRuns" RENAME COLUMN "SubscriptionId" TO "subscription_id";--> statement-breakpoint
ALTER TABLE "BillingRuns" RENAME COLUMN "PaymentMethodId" TO "payment_method_id";--> statement-breakpoint
ALTER TABLE "BillingRuns" RENAME COLUMN "lastStripePaymentIntentEventTimestamp" TO "last_stripe_payment_intent_event_timestamp";--> statement-breakpoint
ALTER TABLE "Invoices" RENAME COLUMN "PurchaseId" TO "purchase_id";--> statement-breakpoint
ALTER TABLE "Invoices" RENAME COLUMN "invoiceNumber" TO "invoice_number";--> statement-breakpoint
ALTER TABLE "Invoices" RENAME COLUMN "invoiceDate" TO "invoice_date";--> statement-breakpoint
ALTER TABLE "Invoices" RENAME COLUMN "BillingPeriodId" TO "billing_period_id";--> statement-breakpoint
ALTER TABLE "Invoices" RENAME COLUMN "dueDate" TO "due_date";--> statement-breakpoint
ALTER TABLE "Invoices" RENAME COLUMN "stripePaymentIntentId" TO "stripe_payment_intent_id";--> statement-breakpoint
ALTER TABLE "Invoices" RENAME COLUMN "CustomerProfileId" TO "customer_profile_id";--> statement-breakpoint
ALTER TABLE "Invoices" RENAME COLUMN "OrganizationId" TO "organization_id";--> statement-breakpoint
ALTER TABLE "Invoices" RENAME COLUMN "billingPeriodStartDate" TO "billing_period_start_date";--> statement-breakpoint
ALTER TABLE "Invoices" RENAME COLUMN "billingPeriodEndDate" TO "billing_period_end_date";--> statement-breakpoint
ALTER TABLE "Invoices" RENAME COLUMN "billingIntervalCount" TO "billing_interval_count";--> statement-breakpoint
ALTER TABLE "Invoices" RENAME COLUMN "billingAnchorDate" TO "billing_anchor_date";--> statement-breakpoint
ALTER TABLE "Invoices" RENAME COLUMN "ownerMembershipId" TO "owner_membership_id";--> statement-breakpoint
ALTER TABLE "Invoices" RENAME COLUMN "pdfURL" TO "pdf_url";--> statement-breakpoint
ALTER TABLE "Invoices" RENAME COLUMN "receiptPdfURL" TO "receipt_pdf_url";--> statement-breakpoint
ALTER TABLE "Invoices" RENAME COLUMN "bankPaymentOnly" TO "bank_payment_only";--> statement-breakpoint
ALTER TABLE "Invoices" DROP CONSTRAINT "Invoices_invoiceNumber_unique";--> statement-breakpoint
ALTER TABLE "ApiKeys" DROP CONSTRAINT "ApiKeys_OrganizationId_Organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "BillingPeriodItems" DROP CONSTRAINT "BillingPeriodItems_BillingPeriodId_BillingPeriods_id_fk";
--> statement-breakpoint
ALTER TABLE "BillingPeriodItems" DROP CONSTRAINT "BillingPeriodItems_DiscountRedemptionId_DiscountRedemptions_id_fk";
--> statement-breakpoint
ALTER TABLE "BillingPeriods" DROP CONSTRAINT "BillingPeriods_SubscriptionId_Subscriptions_id_fk";
--> statement-breakpoint
ALTER TABLE "BillingRuns" DROP CONSTRAINT "BillingRuns_BillingPeriodId_BillingPeriods_id_fk";
--> statement-breakpoint
ALTER TABLE "BillingRuns" DROP CONSTRAINT "BillingRuns_SubscriptionId_Subscriptions_id_fk";
--> statement-breakpoint
ALTER TABLE "BillingRuns" DROP CONSTRAINT "BillingRuns_PaymentMethodId_PaymentMethods_id_fk";
--> statement-breakpoint
ALTER TABLE "Invoices" DROP CONSTRAINT "Invoices_PurchaseId_Purchases_id_fk";
--> statement-breakpoint
ALTER TABLE "Invoices" DROP CONSTRAINT "Invoices_BillingPeriodId_BillingPeriods_id_fk";
--> statement-breakpoint
ALTER TABLE "Invoices" DROP CONSTRAINT "Invoices_CustomerProfileId_CustomerProfiles_id_fk";
--> statement-breakpoint
ALTER TABLE "Invoices" DROP CONSTRAINT "Invoices_OrganizationId_Organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "Invoices" DROP CONSTRAINT "Invoices_ownerMembershipId_Memberships_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "ApiKeys_OrganizationId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "BillingPeriodItems_BillingPeriodId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "BillingPeriodItems_DiscountRedemptionId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "BillingPeriods_SubscriptionId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "BillingRuns_BillingPeriodId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Invoices_invoiceNumber_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Invoices_PurchaseId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Invoices_CustomerProfileId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Invoices_stripePaymentIntentId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Invoices_OrganizationId_idx";--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ApiKeys" ADD CONSTRAINT "ApiKeys_organization_id_Organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."Organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "BillingPeriodItems" ADD CONSTRAINT "BillingPeriodItems_billing_period_id_BillingPeriods_id_fk" FOREIGN KEY ("billing_period_id") REFERENCES "public"."BillingPeriods"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "BillingPeriodItems" ADD CONSTRAINT "BillingPeriodItems_discount_redemption_id_DiscountRedemptions_id_fk" FOREIGN KEY ("discount_redemption_id") REFERENCES "public"."DiscountRedemptions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "BillingPeriods" ADD CONSTRAINT "BillingPeriods_subscription_id_Subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."Subscriptions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "BillingRuns" ADD CONSTRAINT "BillingRuns_billing_period_id_BillingPeriods_id_fk" FOREIGN KEY ("billing_period_id") REFERENCES "public"."BillingPeriods"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "BillingRuns" ADD CONSTRAINT "BillingRuns_subscription_id_Subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."Subscriptions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "BillingRuns" ADD CONSTRAINT "BillingRuns_payment_method_id_PaymentMethods_id_fk" FOREIGN KEY ("payment_method_id") REFERENCES "public"."PaymentMethods"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Invoices" ADD CONSTRAINT "Invoices_purchase_id_Purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."Purchases"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Invoices" ADD CONSTRAINT "Invoices_billing_period_id_BillingPeriods_id_fk" FOREIGN KEY ("billing_period_id") REFERENCES "public"."BillingPeriods"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Invoices" ADD CONSTRAINT "Invoices_customer_profile_id_CustomerProfiles_id_fk" FOREIGN KEY ("customer_profile_id") REFERENCES "public"."CustomerProfiles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Invoices" ADD CONSTRAINT "Invoices_organization_id_Organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."Organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Invoices" ADD CONSTRAINT "Invoices_owner_membership_id_Memberships_id_fk" FOREIGN KEY ("owner_membership_id") REFERENCES "public"."Memberships"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ApiKeys_organization_id_idx" ON "ApiKeys" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "BillingPeriodItems_billing_period_id_idx" ON "BillingPeriodItems" USING btree ("billing_period_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "BillingPeriodItems_discount_redemption_id_idx" ON "BillingPeriodItems" USING btree ("discount_redemption_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "BillingPeriods_subscription_id_idx" ON "BillingPeriods" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "BillingRuns_billing_period_id_idx" ON "BillingRuns" USING btree ("billing_period_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Invoices_invoice_number_unique_idx" ON "Invoices" USING btree ("invoice_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Invoices_purchase_id_idx" ON "Invoices" USING btree ("purchase_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Invoices_customer_profile_id_idx" ON "Invoices" USING btree ("customer_profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Invoices_stripe_payment_intent_id_idx" ON "Invoices" USING btree ("stripe_payment_intent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Invoices_organization_id_idx" ON "Invoices" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "Invoices" ADD CONSTRAINT "Invoices_invoice_number_unique" UNIQUE("invoice_number");