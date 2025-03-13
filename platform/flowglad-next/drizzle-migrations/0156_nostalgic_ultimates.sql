ALTER TABLE "CustomerProfiles" RENAME TO "customer_profiles";--> statement-breakpoint
ALTER TABLE "customer_profiles" RENAME COLUMN "CustomerId" TO "customer_id";--> statement-breakpoint
ALTER TABLE "customer_profiles" RENAME COLUMN "OrganizationId" TO "organization_id";--> statement-breakpoint
ALTER TABLE "customer_profiles" RENAME COLUMN "invoiceNumberBase" TO "invoice_number_base";--> statement-breakpoint
ALTER TABLE "customer_profiles" RENAME COLUMN "stripeCustomerId" TO "stripe_customer_id";--> statement-breakpoint
ALTER TABLE "customer_profiles" RENAME COLUMN "customerTaxId" TO "customer_tax_id";--> statement-breakpoint
ALTER TABLE "customer_profiles" RENAME COLUMN "slackId" TO "slack_id";--> statement-breakpoint
ALTER TABLE "customer_profiles" RENAME COLUMN "logoURL" TO "logo_url";--> statement-breakpoint
ALTER TABLE "customer_profiles" RENAME COLUMN "iconURL" TO "icon_url";--> statement-breakpoint
ALTER TABLE "customer_profiles" RENAME COLUMN "billingAddress" TO "billing_address";--> statement-breakpoint
ALTER TABLE "customer_profiles" RENAME COLUMN "externalId" TO "external_id";--> statement-breakpoint
ALTER TABLE "Customers" RENAME COLUMN "billingAddress" TO "billing_address";--> statement-breakpoint
ALTER TABLE "Customers" RENAME COLUMN "UserId" TO "user_id";--> statement-breakpoint
ALTER TABLE "DiscountRedemptions" RENAME COLUMN "DiscountId" TO "discount_id";--> statement-breakpoint
ALTER TABLE "DiscountRedemptions" RENAME COLUMN "PurchaseId" TO "purchase_id";--> statement-breakpoint
ALTER TABLE "DiscountRedemptions" RENAME COLUMN "discountName" TO "discount_name";--> statement-breakpoint
ALTER TABLE "DiscountRedemptions" RENAME COLUMN "discountCode" TO "discount_code";--> statement-breakpoint
ALTER TABLE "DiscountRedemptions" RENAME COLUMN "discountAmount" TO "discount_amount";--> statement-breakpoint
ALTER TABLE "DiscountRedemptions" RENAME COLUMN "discountAmountType" TO "discount_amount_type";--> statement-breakpoint
ALTER TABLE "DiscountRedemptions" RENAME COLUMN "numberOfPayments" TO "number_of_payments";--> statement-breakpoint
ALTER TABLE "Discounts" RENAME COLUMN "OrganizationId" TO "organization_id";--> statement-breakpoint
ALTER TABLE "Events" RENAME COLUMN "OrganizationId" TO "organization_id";--> statement-breakpoint
ALTER TABLE "FeeCalculations" RENAME COLUMN "OrganizationId" TO "organization_id";--> statement-breakpoint
ALTER TABLE "FeeCalculations" RENAME COLUMN "DiscountId" TO "discount_id";--> statement-breakpoint
ALTER TABLE "FeeCalculations" RENAME COLUMN "VariantId" TO "variant_id";--> statement-breakpoint
ALTER TABLE "FeeCalculations" RENAME COLUMN "BillingPeriodId" TO "billing_period_id";--> statement-breakpoint
ALTER TABLE "Files" RENAME COLUMN "OrganizationId" TO "organization_id";--> statement-breakpoint
ALTER TABLE "Forms" RENAME COLUMN "OrganizationId" TO "organization_id";--> statement-breakpoint
ALTER TABLE "Integrations" RENAME COLUMN "OrganizationId" TO "organization_id";--> statement-breakpoint
ALTER TABLE "InvoiceLineItems" RENAME COLUMN "InvoiceId" TO "invoice_id";--> statement-breakpoint
ALTER TABLE "InvoiceLineItems" RENAME COLUMN "VariantId" TO "variant_id";--> statement-breakpoint
ALTER TABLE "Links" RENAME COLUMN "OrganizationId" TO "organization_id";--> statement-breakpoint
ALTER TABLE "Memberships" RENAME COLUMN "OrganizationId" TO "organization_id";--> statement-breakpoint
ALTER TABLE "Messages" RENAME COLUMN "CustomerProfileId" TO "customer_profile_id";--> statement-breakpoint
ALTER TABLE "PaymentMethods" RENAME COLUMN "CustomerProfileId" TO "customer_profile_id";--> statement-breakpoint
ALTER TABLE "Payments" RENAME COLUMN "InvoiceId" TO "invoice_id";--> statement-breakpoint
ALTER TABLE "Payments" RENAME COLUMN "OrganizationId" TO "organization_id";--> statement-breakpoint
ALTER TABLE "Payments" RENAME COLUMN "CustomerProfileId" TO "customer_profile_id";--> statement-breakpoint
ALTER TABLE "Payments" RENAME COLUMN "BillingPeriodId" TO "billing_period_id";--> statement-breakpoint
ALTER TABLE "Products" RENAME COLUMN "OrganizationId" TO "organization_id";--> statement-breakpoint
ALTER TABLE "ProperNouns" RENAME COLUMN "OrganizationId" TO "organization_id";--> statement-breakpoint
ALTER TABLE "Purchases" RENAME COLUMN "CustomerProfileId" TO "customer_profile_id";--> statement-breakpoint
ALTER TABLE "Purchases" RENAME COLUMN "OrganizationId" TO "organization_id";--> statement-breakpoint
ALTER TABLE "Purchases" RENAME COLUMN "billingCycleAnchor" TO "billing_cycle_anchor";--> statement-breakpoint
ALTER TABLE "Purchases" RENAME COLUMN "VariantId" TO "variant_id";--> statement-breakpoint
ALTER TABLE "Purchases" RENAME COLUMN "priceType" TO "price_type";--> statement-breakpoint
ALTER TABLE "Purchases" RENAME COLUMN "trialPeriodDays" TO "trial_period_days";--> statement-breakpoint
ALTER TABLE "Purchases" RENAME COLUMN "pricePerBillingCycle" TO "price_per_billing_cycle";--> statement-breakpoint
ALTER TABLE "Purchases" RENAME COLUMN "intervalUnit" TO "interval_unit";--> statement-breakpoint
ALTER TABLE "Purchases" RENAME COLUMN "intervalCount" TO "interval_count";--> statement-breakpoint
ALTER TABLE "Purchases" RENAME COLUMN "firstInvoiceValue" TO "first_invoice_value";--> statement-breakpoint
ALTER TABLE "Purchases" RENAME COLUMN "totalPurchaseValue" TO "total_purchase_value";--> statement-breakpoint
ALTER TABLE "Purchases" RENAME COLUMN "bankPaymentOnly" TO "bank_payment_only";--> statement-breakpoint
ALTER TABLE "Purchases" RENAME COLUMN "purchaseDate" TO "purchase_date";--> statement-breakpoint
ALTER TABLE "Purchases" RENAME COLUMN "endDate" TO "end_date";--> statement-breakpoint
ALTER TABLE "Purchases" RENAME COLUMN "billingAddress" TO "billing_address";--> statement-breakpoint
ALTER TABLE "PurchaseSessions" RENAME COLUMN "billingAddress" TO "billing_address";--> statement-breakpoint
ALTER TABLE "PurchaseSessions" RENAME COLUMN "VariantId" TO "variant_id";--> statement-breakpoint
ALTER TABLE "PurchaseSessions" RENAME COLUMN "PurchaseId" TO "purchase_id";--> statement-breakpoint
ALTER TABLE "PurchaseSessions" RENAME COLUMN "InvoiceId" TO "invoice_id";--> statement-breakpoint
ALTER TABLE "PurchaseSessions" RENAME COLUMN "OrganizationId" TO "organization_id";--> statement-breakpoint
ALTER TABLE "PurchaseSessions" RENAME COLUMN "customerName" TO "customer_name";--> statement-breakpoint
ALTER TABLE "PurchaseSessions" RENAME COLUMN "customerEmail" TO "customer_email";--> statement-breakpoint
ALTER TABLE "PurchaseSessions" RENAME COLUMN "stripeSetupIntentId" TO "stripe_setup_intent_id";--> statement-breakpoint
ALTER TABLE "PurchaseSessions" RENAME COLUMN "stripePaymentIntentId" TO "stripe_payment_intent_id";--> statement-breakpoint
ALTER TABLE "PurchaseSessions" RENAME COLUMN "CustomerProfileId" TO "customer_profile_id";--> statement-breakpoint
ALTER TABLE "PurchaseSessions" RENAME COLUMN "DiscountId" TO "discount_id";--> statement-breakpoint
ALTER TABLE "SubscriptionItems" RENAME COLUMN "SubscriptionId" TO "subscription_id";--> statement-breakpoint
ALTER TABLE "SubscriptionItems" RENAME COLUMN "addedDate" TO "added_date";--> statement-breakpoint
ALTER TABLE "SubscriptionItems" RENAME COLUMN "VariantId" TO "variant_id";--> statement-breakpoint
ALTER TABLE "SubscriptionItems" RENAME COLUMN "unitPrice" TO "unit_price";--> statement-breakpoint
ALTER TABLE "Subscriptions" RENAME COLUMN "CustomerProfileId" TO "customer_profile_id";--> statement-breakpoint
ALTER TABLE "Subscriptions" RENAME COLUMN "OrganizationId" TO "organization_id";--> statement-breakpoint
ALTER TABLE "Subscriptions" RENAME COLUMN "VariantId" TO "variant_id";--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'CustomerProfiles_id_unique') THEN
    ALTER TABLE "customer_profiles" DROP CONSTRAINT "CustomerProfiles_id_unique";
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "Purchases" DROP CONSTRAINT "Purchases_stripeSubscriptionId_unique";--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'CustomerProfiles_CustomerId_Customers_id_fk') THEN
    ALTER TABLE "customer_profiles" DROP CONSTRAINT "CustomerProfiles_CustomerId_Customers_id_fk";
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "customer_profiles" DROP CONSTRAINT "CustomerProfiles_OrganizationId_Organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "Customers" DROP CONSTRAINT "Customers_UserId_Users_id_fk";
--> statement-breakpoint
ALTER TABLE "DiscountRedemptions" DROP CONSTRAINT "DiscountRedemptions_DiscountId_Discounts_id_fk";
--> statement-breakpoint
ALTER TABLE "DiscountRedemptions" DROP CONSTRAINT "DiscountRedemptions_PurchaseId_Purchases_id_fk";
--> statement-breakpoint
ALTER TABLE "Discounts" DROP CONSTRAINT "Discounts_OrganizationId_Organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "Events" DROP CONSTRAINT "Events_OrganizationId_Organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "FeeCalculations" DROP CONSTRAINT "FeeCalculations_OrganizationId_Organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "FeeCalculations" DROP CONSTRAINT "FeeCalculations_DiscountId_Discounts_id_fk";
--> statement-breakpoint
ALTER TABLE "FeeCalculations" DROP CONSTRAINT "FeeCalculations_VariantId_Variants_id_fk";
--> statement-breakpoint
ALTER TABLE "FeeCalculations" DROP CONSTRAINT "FeeCalculations_BillingPeriodId_billing_periods_id_fk";
--> statement-breakpoint
ALTER TABLE "Files" DROP CONSTRAINT "Files_OrganizationId_Organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "Forms" DROP CONSTRAINT "Forms_OrganizationId_Organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "Integrations" DROP CONSTRAINT "Integrations_OrganizationId_Organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "InvoiceLineItems" DROP CONSTRAINT "InvoiceLineItems_InvoiceId_Invoices_id_fk";
--> statement-breakpoint
ALTER TABLE "InvoiceLineItems" DROP CONSTRAINT "InvoiceLineItems_VariantId_Variants_id_fk";
--> statement-breakpoint
ALTER TABLE "Invoices" DROP CONSTRAINT "Invoices_customer_profile_id_CustomerProfiles_id_fk";
--> statement-breakpoint
ALTER TABLE "Links" DROP CONSTRAINT "Links_OrganizationId_Organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "Memberships" DROP CONSTRAINT "Memberships_OrganizationId_Organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "Messages" DROP CONSTRAINT "Messages_CustomerProfileId_CustomerProfiles_id_fk";
--> statement-breakpoint
ALTER TABLE "PaymentMethods" DROP CONSTRAINT "PaymentMethods_CustomerProfileId_CustomerProfiles_id_fk";
--> statement-breakpoint
ALTER TABLE "Payments" DROP CONSTRAINT "Payments_InvoiceId_Invoices_id_fk";
--> statement-breakpoint
ALTER TABLE "Payments" DROP CONSTRAINT "Payments_OrganizationId_Organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "Payments" DROP CONSTRAINT "Payments_CustomerProfileId_CustomerProfiles_id_fk";
--> statement-breakpoint
ALTER TABLE "Payments" DROP CONSTRAINT "Payments_BillingPeriodId_billing_periods_id_fk";
--> statement-breakpoint
ALTER TABLE "Products" DROP CONSTRAINT "Products_OrganizationId_Organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "ProperNouns" DROP CONSTRAINT "ProperNouns_OrganizationId_Organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "Purchases" DROP CONSTRAINT "Purchases_CustomerProfileId_CustomerProfiles_id_fk";
--> statement-breakpoint
ALTER TABLE "Purchases" DROP CONSTRAINT "Purchases_OrganizationId_Organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "Purchases" DROP CONSTRAINT "Purchases_VariantId_Variants_id_fk";
--> statement-breakpoint
ALTER TABLE "PurchaseSessions" DROP CONSTRAINT "PurchaseSessions_VariantId_Variants_id_fk";
--> statement-breakpoint
ALTER TABLE "PurchaseSessions" DROP CONSTRAINT "PurchaseSessions_PurchaseId_Purchases_id_fk";
--> statement-breakpoint
ALTER TABLE "PurchaseSessions" DROP CONSTRAINT "PurchaseSessions_InvoiceId_Invoices_id_fk";
--> statement-breakpoint
ALTER TABLE "PurchaseSessions" DROP CONSTRAINT "PurchaseSessions_OrganizationId_Organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "PurchaseSessions" DROP CONSTRAINT "PurchaseSessions_CustomerProfileId_CustomerProfiles_id_fk";
--> statement-breakpoint
ALTER TABLE "PurchaseSessions" DROP CONSTRAINT "PurchaseSessions_DiscountId_Discounts_id_fk";
--> statement-breakpoint
ALTER TABLE "SubscriptionItems" DROP CONSTRAINT "SubscriptionItems_SubscriptionId_Subscriptions_id_fk";
--> statement-breakpoint
ALTER TABLE "SubscriptionItems" DROP CONSTRAINT "SubscriptionItems_VariantId_Variants_id_fk";
--> statement-breakpoint
ALTER TABLE "Subscriptions" DROP CONSTRAINT "Subscriptions_CustomerProfileId_CustomerProfiles_id_fk";
--> statement-breakpoint
ALTER TABLE "Subscriptions" DROP CONSTRAINT "Subscriptions_OrganizationId_Organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "Subscriptions" DROP CONSTRAINT "Subscriptions_VariantId_Variants_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "CustomerProfiles_CustomerId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "CustomerProfiles_OrganizationId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "CustomerProfiles_email_OrganizationId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "CustomerProfiles_CustomerId_OrganizationId_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "CustomerProfiles_OrganizationId_externalId_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "CustomerProfiles_OrganizationId_invoiceNumberBase_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "CustomerProfiles_stripeCustomerId_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "CustomerProfiles_slackId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Customers_UserId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "DiscountRedemptions_DiscountId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "DiscountRedemptions_PurchaseId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "DiscountRedemptions_PurchaseId_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Discounts_OrganizationId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Discounts_code_OrganizationId_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "FeeCalculations_OrganizationId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "FeeCalculations_DiscountId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Files_OrganizationId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Forms_OrganizationId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Integrations_OrganizationId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "InvoiceLineItems_InvoiceId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "InvoiceLineItems_VariantId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Links_OrganizationId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Memberships_OrganizationId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Memberships_UserId_OrganizationId_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "PaymentMethods_CustomerProfileId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Payments_InvoiceId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Payments_OrganizationId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Payments_CustomerProfileId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Products_OrganizationId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "ProperNouns_OrganizationId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "ProperNouns_entityType_EntityId_OrganizationId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Purchases_CustomerProfileId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Purchases_OrganizationId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Purchases_VariantId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "PurchaseSessions_VariantId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "PurchaseSessions_stripePaymentIntentId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "PurchaseSessions_OrganizationId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "PurchaseSessions_stripeSetupIntentId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "PurchaseSessions_PurchaseId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "PurchaseSessions_DiscountId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "PurchaseSessions_CustomerProfileId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "SubscriptionItems_SubscriptionId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "SubscriptionItems_VariantId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Subscriptions_CustomerProfileId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Subscriptions_VariantId_idx";--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_customer_id_Customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."Customers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_organization_id_Organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."Organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Customers" ADD CONSTRAINT "Customers_user_id_Users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."Users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "DiscountRedemptions" ADD CONSTRAINT "DiscountRedemptions_discount_id_Discounts_id_fk" FOREIGN KEY ("discount_id") REFERENCES "public"."Discounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "DiscountRedemptions" ADD CONSTRAINT "DiscountRedemptions_purchase_id_Purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."Purchases"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Discounts" ADD CONSTRAINT "Discounts_organization_id_Organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."Organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Events" ADD CONSTRAINT "Events_organization_id_Organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."Organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "FeeCalculations" ADD CONSTRAINT "FeeCalculations_organization_id_Organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."Organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "FeeCalculations" ADD CONSTRAINT "FeeCalculations_discount_id_Discounts_id_fk" FOREIGN KEY ("discount_id") REFERENCES "public"."Discounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "FeeCalculations" ADD CONSTRAINT "FeeCalculations_variant_id_Variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."Variants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "FeeCalculations" ADD CONSTRAINT "FeeCalculations_billing_period_id_billing_periods_id_fk" FOREIGN KEY ("billing_period_id") REFERENCES "public"."billing_periods"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Files" ADD CONSTRAINT "Files_organization_id_Organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."Organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Forms" ADD CONSTRAINT "Forms_organization_id_Organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."Organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Integrations" ADD CONSTRAINT "Integrations_organization_id_Organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."Organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "InvoiceLineItems" ADD CONSTRAINT "InvoiceLineItems_invoice_id_Invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."Invoices"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "InvoiceLineItems" ADD CONSTRAINT "InvoiceLineItems_variant_id_Variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."Variants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Invoices" ADD CONSTRAINT "Invoices_customer_profile_id_customer_profiles_id_fk" FOREIGN KEY ("customer_profile_id") REFERENCES "public"."customer_profiles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Links" ADD CONSTRAINT "Links_organization_id_Organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."Organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Memberships" ADD CONSTRAINT "Memberships_organization_id_Organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."Organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Messages" ADD CONSTRAINT "Messages_customer_profile_id_customer_profiles_id_fk" FOREIGN KEY ("customer_profile_id") REFERENCES "public"."customer_profiles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "PaymentMethods" ADD CONSTRAINT "PaymentMethods_customer_profile_id_customer_profiles_id_fk" FOREIGN KEY ("customer_profile_id") REFERENCES "public"."customer_profiles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Payments" ADD CONSTRAINT "Payments_invoice_id_Invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."Invoices"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Payments" ADD CONSTRAINT "Payments_organization_id_Organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."Organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Payments" ADD CONSTRAINT "Payments_customer_profile_id_customer_profiles_id_fk" FOREIGN KEY ("customer_profile_id") REFERENCES "public"."customer_profiles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Payments" ADD CONSTRAINT "Payments_billing_period_id_billing_periods_id_fk" FOREIGN KEY ("billing_period_id") REFERENCES "public"."billing_periods"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Products" ADD CONSTRAINT "Products_organization_id_Organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."Organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProperNouns" ADD CONSTRAINT "ProperNouns_organization_id_Organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."Organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Purchases" ADD CONSTRAINT "Purchases_customer_profile_id_customer_profiles_id_fk" FOREIGN KEY ("customer_profile_id") REFERENCES "public"."customer_profiles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Purchases" ADD CONSTRAINT "Purchases_organization_id_Organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."Organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Purchases" ADD CONSTRAINT "Purchases_variant_id_Variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."Variants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "PurchaseSessions" ADD CONSTRAINT "PurchaseSessions_variant_id_Variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."Variants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "PurchaseSessions" ADD CONSTRAINT "PurchaseSessions_purchase_id_Purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."Purchases"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "PurchaseSessions" ADD CONSTRAINT "PurchaseSessions_invoice_id_Invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."Invoices"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "PurchaseSessions" ADD CONSTRAINT "PurchaseSessions_organization_id_Organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."Organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "PurchaseSessions" ADD CONSTRAINT "PurchaseSessions_customer_profile_id_customer_profiles_id_fk" FOREIGN KEY ("customer_profile_id") REFERENCES "public"."customer_profiles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "PurchaseSessions" ADD CONSTRAINT "PurchaseSessions_discount_id_Discounts_id_fk" FOREIGN KEY ("discount_id") REFERENCES "public"."Discounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "SubscriptionItems" ADD CONSTRAINT "SubscriptionItems_subscription_id_Subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."Subscriptions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "SubscriptionItems" ADD CONSTRAINT "SubscriptionItems_variant_id_Variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."Variants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Subscriptions" ADD CONSTRAINT "Subscriptions_customer_profile_id_customer_profiles_id_fk" FOREIGN KEY ("customer_profile_id") REFERENCES "public"."customer_profiles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Subscriptions" ADD CONSTRAINT "Subscriptions_organization_id_Organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."Organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Subscriptions" ADD CONSTRAINT "Subscriptions_variant_id_Variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."Variants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_profiles_customer_id_idx" ON "customer_profiles" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_profiles_organization_id_idx" ON "customer_profiles" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_profiles_email_organization_id_idx" ON "customer_profiles" USING btree ("email","organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "customer_profiles_customer_id_organization_id_unique_idx" ON "customer_profiles" USING btree ("customer_id","organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "customer_profiles_organization_id_external_id_unique_idx" ON "customer_profiles" USING btree ("organization_id","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "customer_profiles_organization_id_invoice_number_base_unique_idx" ON "customer_profiles" USING btree ("organization_id","invoice_number_base");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "customer_profiles_stripe_customer_id_unique_idx" ON "customer_profiles" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_profiles_slack_id_idx" ON "customer_profiles" USING btree ("slack_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Customers_user_id_idx" ON "Customers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "DiscountRedemptions_discount_id_idx" ON "DiscountRedemptions" USING btree ("discount_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "DiscountRedemptions_purchase_id_idx" ON "DiscountRedemptions" USING btree ("purchase_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "DiscountRedemptions_purchase_id_unique_idx" ON "DiscountRedemptions" USING btree ("purchase_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Discounts_organization_id_idx" ON "Discounts" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Discounts_code_organization_id_unique_idx" ON "Discounts" USING btree ("code","organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "FeeCalculations_organization_id_idx" ON "FeeCalculations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "FeeCalculations_discount_id_idx" ON "FeeCalculations" USING btree ("discount_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Files_organization_id_idx" ON "Files" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Forms_organization_id_idx" ON "Forms" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Integrations_organization_id_idx" ON "Integrations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "InvoiceLineItems_invoice_id_idx" ON "InvoiceLineItems" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "InvoiceLineItems_variant_id_idx" ON "InvoiceLineItems" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Links_organization_id_idx" ON "Links" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Memberships_organization_id_idx" ON "Memberships" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Memberships_UserId_organization_id_unique_idx" ON "Memberships" USING btree ("UserId","organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "PaymentMethods_customer_profile_id_idx" ON "PaymentMethods" USING btree ("customer_profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Payments_invoice_id_idx" ON "Payments" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Payments_organization_id_idx" ON "Payments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Payments_customer_profile_id_idx" ON "Payments" USING btree ("customer_profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Products_organization_id_idx" ON "Products" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ProperNouns_organization_id_idx" ON "ProperNouns" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ProperNouns_entityType_EntityId_organization_id_idx" ON "ProperNouns" USING btree ("entityType","EntityId","organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Purchases_customer_profile_id_idx" ON "Purchases" USING btree ("customer_profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Purchases_organization_id_idx" ON "Purchases" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Purchases_variant_id_idx" ON "Purchases" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "PurchaseSessions_variant_id_idx" ON "PurchaseSessions" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "PurchaseSessions_stripe_payment_intent_id_idx" ON "PurchaseSessions" USING btree ("stripe_payment_intent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "PurchaseSessions_organization_id_idx" ON "PurchaseSessions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "PurchaseSessions_stripe_setup_intent_id_idx" ON "PurchaseSessions" USING btree ("stripe_setup_intent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "PurchaseSessions_purchase_id_idx" ON "PurchaseSessions" USING btree ("purchase_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "PurchaseSessions_discount_id_idx" ON "PurchaseSessions" USING btree ("discount_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "PurchaseSessions_customer_profile_id_idx" ON "PurchaseSessions" USING btree ("customer_profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "SubscriptionItems_subscription_id_idx" ON "SubscriptionItems" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "SubscriptionItems_variant_id_idx" ON "SubscriptionItems" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Subscriptions_customer_profile_id_idx" ON "Subscriptions" USING btree ("customer_profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Subscriptions_variant_id_idx" ON "Subscriptions" USING btree ("variant_id");--> statement-breakpoint
ALTER TABLE "Purchases" DROP COLUMN IF EXISTS "stripeSubscriptionId";--> statement-breakpoint
ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_id_unique" UNIQUE("id");--> statement-breakpoint
ALTER POLICY "Enable all actions for own organizations" ON "api_keys" TO authenticated USING ("organization_id" in (select "organization_id" from "Memberships"));--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "billing_period_items" TO authenticated USING ("billing_period_id" in (select "id" from "billing_periods" where "subscription_id" in (select "id" from "Subscriptions" where "organization_id" in (select "organization_id" from "Memberships"))));--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "billing_periods" TO authenticated USING ("subscription_id" in (select "id" from "Subscriptions" where "organization_id" in (select "organization_id" from "Memberships")));--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "billing_runs" TO authenticated USING ("billing_period_id" in (select "id" from "billing_periods" where "subscription_id" in (select "id" from "Subscriptions" where "organization_id" in (select "organization_id" from "Memberships"))));--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "DiscountRedemptions" TO authenticated USING ("discount_id" in (select "discount_id" from "Discounts" where "organization_id" in (select "organization_id" from "Memberships")));--> statement-breakpoint
ALTER POLICY "Enable all actions for discounts in own organization" ON "Discounts" TO authenticated USING ("organization_id" in (select "organization_id" from "Memberships"));--> statement-breakpoint
ALTER POLICY "Enable all actions for own organization" ON "Events" TO authenticated USING ("organization_id" in (select "organization_id" from "Memberships"));--> statement-breakpoint
ALTER POLICY "Enable select for own organization" ON "FeeCalculations" TO authenticated USING ("organization_id" in (select "organization_id" from "Memberships"));--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "Files" TO authenticated USING ("organization_id" in (select "organization_id" from "Memberships")) WITH CHECK ("ProductId" is null OR "ProductId" in (select "id" from "Products"));--> statement-breakpoint
ALTER POLICY "Enable all for own organizations" ON "Forms" TO authenticated USING ("organization_id" in (select "organization_id" from "Memberships")) WITH CHECK ("ProductId" is null OR "ProductId" in (select "id" from "Products"));--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "Integrations" TO authenticated USING ("organization_id" in (select "organization_id" from "Memberships") OR "UserId" = requesting_user_id());--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "Links" TO authenticated USING ("organization_id" in (select "organization_id" from "Memberships")) WITH CHECK ("ProductId" is null OR "ProductId" in (select "id" from "Products"));--> statement-breakpoint
ALTER POLICY "Enable read for own organizations via customer profiles" ON "PaymentMethods" TO authenticated USING ("customer_profile_id" in (select "id" from "customer_profiles"));--> statement-breakpoint
ALTER POLICY "Enable select for own organization" ON "Payments" TO authenticated USING ("organization_id" in (select "organization_id" from "Memberships"));--> statement-breakpoint
ALTER POLICY "Enable update for own organization" ON "Payments" TO authenticated USING ("organization_id" in (select "organization_id" from "Memberships"));--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "Products" TO authenticated USING ("organization_id" in (select "organization_id" from "Memberships"));--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "ProperNouns" TO authenticated USING ("organization_id" in (select "organization_id" from "Memberships" where "UserId" = requesting_user_id()));--> statement-breakpoint
ALTER POLICY "Enable all actions for discounts in own organization" ON "PurchaseSessions" TO authenticated USING ("organization_id" in (select "organization_id" from "Memberships"));--> statement-breakpoint
ALTER POLICY "Enable actions for own organizations via subscriptions" ON "SubscriptionItems" TO authenticated USING ("subscription_id" in (select "id" from "Subscriptions"));--> statement-breakpoint
ALTER POLICY "Enable actions for own organizations via customer profiles" ON "Subscriptions" TO authenticated USING ("customer_profile_id" in (select "id" from "customer_profiles"));