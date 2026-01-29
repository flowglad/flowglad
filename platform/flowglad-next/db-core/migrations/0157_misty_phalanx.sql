ALTER TABLE "DiscountRedemptions" RENAME TO "discount_redemptions";--> statement-breakpoint
ALTER TABLE "Discounts" RENAME TO "discounts";--> statement-breakpoint
ALTER TABLE "Events" RENAME TO "events";--> statement-breakpoint
ALTER TABLE "FeeCalculations" RENAME TO "fee_calculations";--> statement-breakpoint
ALTER TABLE "FormFields" RENAME TO "form_fields";--> statement-breakpoint
ALTER TABLE "Forms" RENAME TO "forms";--> statement-breakpoint
ALTER TABLE "FormSubmissions" RENAME TO "form_submissions";--> statement-breakpoint
ALTER TABLE "Integrations" RENAME TO "integrations";--> statement-breakpoint
ALTER TABLE "IntegrationSessions" RENAME TO "integration_sessions";--> statement-breakpoint
ALTER TABLE "InvoiceLineItems" RENAME TO "invoice_line_items";--> statement-breakpoint
ALTER TABLE "Invoices" RENAME TO "invoices";--> statement-breakpoint
ALTER TABLE "Links" RENAME TO "links";--> statement-breakpoint
ALTER TABLE "Memberships" RENAME TO "memberships";--> statement-breakpoint
ALTER TABLE "Messages" RENAME TO "messages";--> statement-breakpoint
ALTER TABLE "Organizations" RENAME TO "organizations";--> statement-breakpoint
ALTER TABLE "PaymentMethods" RENAME TO "payment_methods";--> statement-breakpoint
ALTER TABLE "Payments" RENAME TO "payments";--> statement-breakpoint
ALTER TABLE "ProperNouns" RENAME TO "proper_nouns";--> statement-breakpoint
ALTER TABLE "Purchases" RENAME TO "purchases";--> statement-breakpoint
ALTER TABLE "SubscriptionItems" RENAME TO "subscription_items";--> statement-breakpoint
ALTER TABLE "Subscriptions" RENAME TO "subscriptions";--> statement-breakpoint
ALTER TABLE "Users" RENAME TO "users";--> statement-breakpoint
ALTER TABLE "Variants" RENAME TO "variants";--> statement-breakpoint
ALTER TABLE "discounts" RENAME COLUMN "amountType" TO "amount_type";--> statement-breakpoint
ALTER TABLE "discounts" RENAME COLUMN "numberOfPayments" TO "number_of_payments";--> statement-breakpoint
ALTER TABLE "discounts" RENAME COLUMN "stripeCouponId" TO "stripe_coupon_id";--> statement-breakpoint
ALTER TABLE "events" RENAME COLUMN "eventCategory" TO "event_category";--> statement-breakpoint
ALTER TABLE "events" RENAME COLUMN "eventRetentionPolicy" TO "event_retention_policy";--> statement-breakpoint
ALTER TABLE "events" RENAME COLUMN "rawPayload" TO "raw_payload";--> statement-breakpoint
ALTER TABLE "events" RENAME COLUMN "occurredAt" TO "occurred_at";--> statement-breakpoint
ALTER TABLE "events" RENAME COLUMN "submittedAt" TO "submitted_at";--> statement-breakpoint
ALTER TABLE "events" RENAME COLUMN "processedAt" TO "processed_at";--> statement-breakpoint
ALTER TABLE "events" RENAME COLUMN "subjectEntity" TO "subject_entity";--> statement-breakpoint
ALTER TABLE "events" RENAME COLUMN "subjectId" TO "subject_id";--> statement-breakpoint
ALTER TABLE "events" RENAME COLUMN "objectEntity" TO "object_entity";--> statement-breakpoint
ALTER TABLE "events" RENAME COLUMN "objectId" TO "object_id";--> statement-breakpoint
ALTER TABLE "fee_calculations" RENAME COLUMN "PurchaseSessionId" TO "purchase_session_id";--> statement-breakpoint
ALTER TABLE "fee_calculations" RENAME COLUMN "PurchaseId" TO "purchase_id";--> statement-breakpoint
ALTER TABLE "fee_calculations" RENAME COLUMN "paymentMethodType" TO "payment_method_type";--> statement-breakpoint
ALTER TABLE "fee_calculations" RENAME COLUMN "discountAmountFixed" TO "discount_amount_fixed";--> statement-breakpoint
ALTER TABLE "fee_calculations" RENAME COLUMN "paymentMethodFeeFixed" TO "payment_method_fee_fixed";--> statement-breakpoint
ALTER TABLE "fee_calculations" RENAME COLUMN "baseAmount" TO "base_amount";--> statement-breakpoint
ALTER TABLE "fee_calculations" RENAME COLUMN "internationalFeePercentage" TO "international_fee_percentage";--> statement-breakpoint
ALTER TABLE "fee_calculations" RENAME COLUMN "flowgladFeePercentage" TO "flowglad_fee_percentage";--> statement-breakpoint
ALTER TABLE "fee_calculations" RENAME COLUMN "billingAddress" TO "billing_address";--> statement-breakpoint
ALTER TABLE "Files" RENAME COLUMN "ProductId" TO "product_id";--> statement-breakpoint
ALTER TABLE "Files" RENAME COLUMN "sizeKb" TO "size_kb";--> statement-breakpoint
ALTER TABLE "Files" RENAME COLUMN "contentType" TO "content_type";--> statement-breakpoint
ALTER TABLE "Files" RENAME COLUMN "objectKey" TO "object_key";--> statement-breakpoint
ALTER TABLE "Files" RENAME COLUMN "cdnUrl" TO "cdn_url";--> statement-breakpoint
ALTER TABLE "Files" RENAME COLUMN "contentHash" TO "content_hash";--> statement-breakpoint
ALTER TABLE "form_fields" RENAME COLUMN "FormId" TO "form_id";--> statement-breakpoint
ALTER TABLE "form_fields" RENAME COLUMN "fieldParameters" TO "field_parameters";--> statement-breakpoint
ALTER TABLE "forms" RENAME COLUMN "ProductId" TO "product_id";--> statement-breakpoint
ALTER TABLE "form_submissions" RENAME COLUMN "FormId" TO "form_id";--> statement-breakpoint
ALTER TABLE "form_submissions" RENAME COLUMN "UserId" TO "user_id";--> statement-breakpoint
ALTER TABLE "integrations" RENAME COLUMN "UserId" TO "user_id";--> statement-breakpoint
ALTER TABLE "integrations" RENAME COLUMN "encryptedAccessToken" TO "encrypted_access_token";--> statement-breakpoint
ALTER TABLE "integrations" RENAME COLUMN "encryptedRefreshToken" TO "encrypted_refresh_token";--> statement-breakpoint
ALTER TABLE "integrations" RENAME COLUMN "encryptedApiKey" TO "encrypted_api_key";--> statement-breakpoint
ALTER TABLE "integrations" RENAME COLUMN "tokenExpiresAt" TO "token_expires_at";--> statement-breakpoint
ALTER TABLE "integrations" RENAME COLUMN "lastTokenRefresh" TO "last_token_refresh";--> statement-breakpoint
ALTER TABLE "integrations" RENAME COLUMN "providerConfig" TO "provider_config";--> statement-breakpoint
ALTER TABLE "integration_sessions" RENAME COLUMN "IntegrationId" TO "integration_id";--> statement-breakpoint
ALTER TABLE "integration_sessions" RENAME COLUMN "codeVerifier" TO "code_verifier";--> statement-breakpoint
ALTER TABLE "integration_sessions" RENAME COLUMN "redirectUrl" TO "redirect_url";--> statement-breakpoint
ALTER TABLE "integration_sessions" RENAME COLUMN "expiresAt" TO "expires_at";--> statement-breakpoint
ALTER TABLE "invoices" RENAME COLUMN "billingInterval" TO "billing_interval";--> statement-breakpoint
ALTER TABLE "invoices" RENAME COLUMN "taxAmount" TO "tax_amount";--> statement-breakpoint
ALTER TABLE "invoices" RENAME COLUMN "stripeTaxCalculationId" TO "stripe_tax_calculation_id";--> statement-breakpoint
ALTER TABLE "invoices" RENAME COLUMN "stripeTaxTransactionId" TO "stripe_tax_transaction_id";--> statement-breakpoint
ALTER TABLE "invoices" RENAME COLUMN "taxType" TO "tax_type";--> statement-breakpoint
ALTER TABLE "invoices" RENAME COLUMN "taxCountry" TO "tax_country";--> statement-breakpoint
ALTER TABLE "invoices" RENAME COLUMN "taxState" TO "tax_state";--> statement-breakpoint
ALTER TABLE "invoices" RENAME COLUMN "taxRatePercentage" TO "tax_rate_percentage";--> statement-breakpoint
ALTER TABLE "links" RENAME COLUMN "ProductId" TO "product_id";--> statement-breakpoint
ALTER TABLE "memberships" RENAME COLUMN "UserId" TO "user_id";--> statement-breakpoint
ALTER TABLE "messages" RENAME COLUMN "messageSentAt" TO "message_sent_at";--> statement-breakpoint
ALTER TABLE "messages" RENAME COLUMN "OrganizationMemberId" TO "organization_member_id";--> statement-breakpoint
ALTER TABLE "messages" RENAME COLUMN "rawText" TO "raw_text";--> statement-breakpoint
ALTER TABLE "messages" RENAME COLUMN "platformThreadId" TO "platform_thread_id";--> statement-breakpoint
ALTER TABLE "messages" RENAME COLUMN "platformChannelId" TO "platform_channel_id";--> statement-breakpoint
ALTER TABLE "messages" RENAME COLUMN "platformId" TO "platform_id";--> statement-breakpoint
ALTER TABLE "messages" RENAME COLUMN "platformUserId" TO "platform_user_id";--> statement-breakpoint
ALTER TABLE "organizations" RENAME COLUMN "stripeAccountId" TO "stripe_account_id";--> statement-breakpoint
ALTER TABLE "organizations" RENAME COLUMN "CountryId" TO "country_id";--> statement-breakpoint
ALTER TABLE "organizations" RENAME COLUMN "logoURL" TO "logo_url";--> statement-breakpoint
ALTER TABLE "organizations" RENAME COLUMN "subdomainSlug" TO "subdomain_slug";--> statement-breakpoint
ALTER TABLE "organizations" RENAME COLUMN "payoutsEnabled" TO "payouts_enabled";--> statement-breakpoint
ALTER TABLE "organizations" RENAME COLUMN "onboardingStatus" TO "onboarding_status";--> statement-breakpoint
ALTER TABLE "organizations" RENAME COLUMN "feePercentage" TO "fee_percentage";--> statement-breakpoint
ALTER TABLE "organizations" RENAME COLUMN "defaultCurrency" TO "default_currency";--> statement-breakpoint
ALTER TABLE "organizations" RENAME COLUMN "billingAddress" TO "billing_address";--> statement-breakpoint
ALTER TABLE "organizations" RENAME COLUMN "contactEmail" TO "contact_email";--> statement-breakpoint
ALTER TABLE "organizations" RENAME COLUMN "stripeConnectContractType" TO "stripe_connect_contract_type";--> statement-breakpoint
ALTER TABLE "payment_methods" RENAME COLUMN "billingDetails" TO "billing_details";--> statement-breakpoint
ALTER TABLE "payment_methods" RENAME COLUMN "paymentMethodData" TO "payment_method_data";--> statement-breakpoint
ALTER TABLE "payment_methods" RENAME COLUMN "stripePaymentMethodId" TO "stripe_payment_method_id";--> statement-breakpoint
ALTER TABLE "payments" RENAME COLUMN "paymentMethod" TO "payment_method";--> statement-breakpoint
ALTER TABLE "payments" RENAME COLUMN "chargeDate" TO "charge_date";--> statement-breakpoint
ALTER TABLE "payments" RENAME COLUMN "settlementDate" TO "settlement_date";--> statement-breakpoint
ALTER TABLE "payments" RENAME COLUMN "receiptNumber" TO "receipt_number";--> statement-breakpoint
ALTER TABLE "payments" RENAME COLUMN "receiptURL" TO "receipt_url";--> statement-breakpoint
ALTER TABLE "payments" RENAME COLUMN "PurchaseId" TO "purchase_id";--> statement-breakpoint
ALTER TABLE "payments" RENAME COLUMN "PaymentMethodId" TO "payment_method_id";--> statement-breakpoint
ALTER TABLE "payments" RENAME COLUMN "stripePaymentIntentId" TO "stripe_payment_intent_id";--> statement-breakpoint
ALTER TABLE "payments" RENAME COLUMN "stripeChargeId" TO "stripe_charge_id";--> statement-breakpoint
ALTER TABLE "payments" RENAME COLUMN "taxAmount" TO "tax_amount";--> statement-breakpoint
ALTER TABLE "payments" RENAME COLUMN "stripeTaxCalculationId" TO "stripe_tax_calculation_id";--> statement-breakpoint
ALTER TABLE "payments" RENAME COLUMN "stripeTaxTransactionId" TO "stripe_tax_transaction_id";--> statement-breakpoint
ALTER TABLE "payments" RENAME COLUMN "taxType" TO "tax_type";--> statement-breakpoint
ALTER TABLE "payments" RENAME COLUMN "taxCountry" TO "tax_country";--> statement-breakpoint
ALTER TABLE "payments" RENAME COLUMN "taxState" TO "tax_state";--> statement-breakpoint
ALTER TABLE "payments" RENAME COLUMN "taxRatePercentage" TO "tax_rate_percentage";--> statement-breakpoint
ALTER TABLE "payments" RENAME COLUMN "refundedAmount" TO "refunded_amount";--> statement-breakpoint
ALTER TABLE "payments" RENAME COLUMN "refundedAt" TO "refunded_at";--> statement-breakpoint
ALTER TABLE "Products" RENAME COLUMN "imageURL" TO "image_url";--> statement-breakpoint
ALTER TABLE "Products" RENAME COLUMN "stripeProductId" TO "stripe_product_id";--> statement-breakpoint
ALTER TABLE "Products" RENAME COLUMN "displayFeatures" TO "display_features";--> statement-breakpoint
ALTER TABLE "proper_nouns" RENAME COLUMN "EntityId" TO "entity_id";--> statement-breakpoint
ALTER TABLE "proper_nouns" RENAME COLUMN "entityType" TO "entity_type";--> statement-breakpoint
ALTER TABLE "PurchaseAccessSessions" RENAME COLUMN "PurchaseId" TO "purchase_id";--> statement-breakpoint
ALTER TABLE "subscriptions" RENAME COLUMN "defaultPaymentMethodId" TO "default_payment_method_id";--> statement-breakpoint
ALTER TABLE "subscriptions" RENAME COLUMN "backupPaymentMethodId" TO "backup_payment_method_id";--> statement-breakpoint
ALTER TABLE "subscriptions" RENAME COLUMN "stripeSetupIntentId" TO "stripe_setup_intent_id";--> statement-breakpoint
ALTER TABLE "subscriptions" RENAME COLUMN "trialEnd" TO "trial_end";--> statement-breakpoint
ALTER TABLE "subscriptions" RENAME COLUMN "currentBillingPeriodStart" TO "current_billing_period_start";--> statement-breakpoint
ALTER TABLE "subscriptions" RENAME COLUMN "currentBillingPeriodEnd" TO "current_billing_period_end";--> statement-breakpoint
ALTER TABLE "subscriptions" RENAME COLUMN "canceledAt" TO "canceled_at";--> statement-breakpoint
ALTER TABLE "subscriptions" RENAME COLUMN "cancelScheduledAt" TO "cancel_scheduled_at";--> statement-breakpoint
ALTER TABLE "subscriptions" RENAME COLUMN "intervalCount" TO "interval_count";--> statement-breakpoint
ALTER TABLE "subscriptions" RENAME COLUMN "billingCycleAnchorDate" TO "billing_cycle_anchor_date";--> statement-breakpoint
ALTER TABLE "variants" RENAME COLUMN "intervalUnit" TO "interval_unit";--> statement-breakpoint
ALTER TABLE "variants" RENAME COLUMN "priceType" TO "price_type";--> statement-breakpoint
ALTER TABLE "variants" RENAME COLUMN "trialPeriodDays" TO "trial_period_days";--> statement-breakpoint
ALTER TABLE "variants" RENAME COLUMN "setupFeeAmount" TO "setup_fee_amount";--> statement-breakpoint
ALTER TABLE "variants" RENAME COLUMN "isDefault" TO "is_default";--> statement-breakpoint
ALTER TABLE "variants" RENAME COLUMN "unitPrice" TO "unit_price";--> statement-breakpoint
ALTER TABLE "variants" RENAME COLUMN "ProductId" TO "product_id";--> statement-breakpoint
ALTER TABLE "variants" RENAME COLUMN "stripePriceId" TO "stripe_price_id";--> statement-breakpoint
ALTER TABLE "discount_redemptions" DROP CONSTRAINT IF EXISTS "DiscountRedemptions_id_unique";--> statement-breakpoint
ALTER TABLE "discounts" DROP CONSTRAINT IF EXISTS "Discounts_id_unique";--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "Events_id_unique";--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "Events_hash_unique";--> statement-breakpoint
ALTER TABLE "fee_calculations" DROP CONSTRAINT IF EXISTS "FeeCalculations_id_unique";--> statement-breakpoint
ALTER TABLE "Files" DROP CONSTRAINT IF EXISTS "Files_objectKey_unique";--> statement-breakpoint
ALTER TABLE "form_fields" DROP CONSTRAINT IF EXISTS "FormFields_id_unique";--> statement-breakpoint
ALTER TABLE "forms" DROP CONSTRAINT IF EXISTS "Forms_id_unique";--> statement-breakpoint
ALTER TABLE "form_submissions" DROP CONSTRAINT IF EXISTS "FormSubmissions_id_unique";--> statement-breakpoint
ALTER TABLE "integrations" DROP CONSTRAINT IF EXISTS "Integrations_id_unique";--> statement-breakpoint
ALTER TABLE "integration_sessions" DROP CONSTRAINT IF EXISTS "IntegrationSessions_id_unique";--> statement-breakpoint
ALTER TABLE "invoice_line_items" DROP CONSTRAINT IF EXISTS "InvoiceLineItems_id_unique";--> statement-breakpoint
ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "Invoices_id_unique";--> statement-breakpoint
ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "Invoices_invoice_number_unique";--> statement-breakpoint
ALTER TABLE "links" DROP CONSTRAINT IF EXISTS "Links_id_unique";--> statement-breakpoint
ALTER TABLE "memberships" DROP CONSTRAINT IF EXISTS "Memberships_id_unique";--> statement-breakpoint
ALTER TABLE "messages" DROP CONSTRAINT IF EXISTS "Messages_id_unique";--> statement-breakpoint
ALTER TABLE "organizations" DROP CONSTRAINT IF EXISTS "Organizations_id_unique";--> statement-breakpoint
ALTER TABLE "organizations" DROP CONSTRAINT IF EXISTS "Organizations_stripeAccountId_unique";--> statement-breakpoint
ALTER TABLE "organizations" DROP CONSTRAINT IF EXISTS "Organizations_domain_unique";--> statement-breakpoint
ALTER TABLE "organizations" DROP CONSTRAINT IF EXISTS "Organizations_subdomainSlug_unique";--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "Payments_PaymentMethodId_PaymentMethods_id_fk";
--> statement-breakpoint
ALTER TABLE "subscriptions" DROP CONSTRAINT IF EXISTS "Subscriptions_defaultPaymentMethodId_PaymentMethods_id_fk";
ALTER TABLE "subscriptions" DROP CONSTRAINT IF EXISTS "Subscriptions_backupPaymentMethodId_PaymentMethods_id_fk";
ALTER TABLE "billing_runs" DROP CONSTRAINT IF EXISTS "billing_runs_payment_method_id_PaymentMethods_id_fk";
--> statement-breakpoint
--> statement-breakpoint
--> statement-breakpoint
ALTER TABLE "payment_methods" DROP CONSTRAINT IF EXISTS "PaymentMethods_id_unique";--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "Payments_id_unique";--> statement-breakpoint
ALTER TABLE "Products" DROP CONSTRAINT IF EXISTS "Products_stripeProductId_unique";--> statement-breakpoint
ALTER TABLE "proper_nouns" DROP CONSTRAINT IF EXISTS "ProperNouns_id_unique";--> statement-breakpoint
ALTER TABLE "purchases" DROP CONSTRAINT IF EXISTS "Purchases_id_unique";--> statement-breakpoint
ALTER TABLE "subscription_items" DROP CONSTRAINT IF EXISTS "SubscriptionItems_id_unique";--> statement-breakpoint
ALTER TABLE "billing_periods" DROP CONSTRAINT IF EXISTS "billing_periods_subscription_id_Subscriptions_id_fk";
--> statement-breakpoint
ALTER TABLE "billing_runs" DROP CONSTRAINT IF EXISTS "billing_runs_subscription_id_Subscriptions_id_fk";
--> statement-breakpoint
ALTER TABLE "subscription_items" DROP CONSTRAINT IF EXISTS "SubscriptionItems_subscription_id_Subscriptions_id_fk";
--> statement-breakpoint
ALTER TABLE "subscriptions" DROP CONSTRAINT IF EXISTS "Subscriptions_id_unique";--> statement-breakpoint
ALTER TABLE "Customers" DROP CONSTRAINT IF EXISTS "Customers_user_id_Users_id_fk";
--> statement-breakpoint
ALTER TABLE "form_submissions" DROP CONSTRAINT IF EXISTS "FormSubmissions_UserId_Users_id_fk";
--> statement-breakpoint
ALTER TABLE "integrations" DROP CONSTRAINT IF EXISTS "Integrations_UserId_Users_id_fk";
--> statement-breakpoint
ALTER TABLE "memberships" DROP CONSTRAINT IF EXISTS "Memberships_UserId_Users_id_fk";
--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "Users_id_unique";--> statement-breakpoint
ALTER TABLE "variants" DROP CONSTRAINT IF EXISTS "Variants_id_unique";--> statement-breakpoint
ALTER TABLE "variants" DROP CONSTRAINT IF EXISTS "Variants_stripePriceId_unique";--> statement-breakpoint
ALTER TABLE "api_keys" DROP CONSTRAINT IF EXISTS "api_keys_organization_id_Organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "billing_period_items" DROP CONSTRAINT IF EXISTS "billing_period_items_discount_redemption_id_DiscountRedemptions_id_fk";
--> statement-breakpoint
ALTER TABLE "customer_profiles" DROP CONSTRAINT IF EXISTS "customer_profiles_organization_id_Organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "discount_redemptions" DROP CONSTRAINT IF EXISTS "DiscountRedemptions_discount_id_Discounts_id_fk";
--> statement-breakpoint
ALTER TABLE "discount_redemptions" DROP CONSTRAINT IF EXISTS "DiscountRedemptions_purchase_id_Purchases_id_fk";
--> statement-breakpoint
ALTER TABLE "discounts" DROP CONSTRAINT IF EXISTS "Discounts_organization_id_Organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "Events_organization_id_Organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "fee_calculations" DROP CONSTRAINT IF EXISTS "FeeCalculations_organization_id_Organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "fee_calculations" DROP CONSTRAINT IF EXISTS "FeeCalculations_PurchaseSessionId_PurchaseSessions_id_fk";
--> statement-breakpoint
ALTER TABLE "fee_calculations" DROP CONSTRAINT IF EXISTS "FeeCalculations_PurchaseId_Purchases_id_fk";
--> statement-breakpoint
ALTER TABLE "fee_calculations" DROP CONSTRAINT IF EXISTS "FeeCalculations_discount_id_Discounts_id_fk";
--> statement-breakpoint
ALTER TABLE "fee_calculations" DROP CONSTRAINT IF EXISTS "FeeCalculations_variant_id_Variants_id_fk";
--> statement-breakpoint
ALTER TABLE "fee_calculations" DROP CONSTRAINT IF EXISTS "FeeCalculations_billing_period_id_billing_periods_id_fk";
--> statement-breakpoint
ALTER TABLE "Files" DROP CONSTRAINT IF EXISTS "Files_organization_id_Organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "Files" DROP CONSTRAINT IF EXISTS "Files_ProductId_Products_id_fk";
--> statement-breakpoint
ALTER TABLE "form_fields" DROP CONSTRAINT IF EXISTS "FormFields_FormId_Forms_id_fk";
--> statement-breakpoint
ALTER TABLE "forms" DROP CONSTRAINT IF EXISTS "Forms_organization_id_Organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "forms" DROP CONSTRAINT IF EXISTS "Forms_ProductId_Products_id_fk";
--> statement-breakpoint
ALTER TABLE "form_submissions" DROP CONSTRAINT IF EXISTS "FormSubmissions_FormId_Forms_id_fk";
--> statement-breakpoint
ALTER TABLE "integrations" DROP CONSTRAINT IF EXISTS "Integrations_organization_id_Organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "integration_sessions" DROP CONSTRAINT IF EXISTS "IntegrationSessions_IntegrationId_Integrations_id_fk";
--> statement-breakpoint
ALTER TABLE "invoice_line_items" DROP CONSTRAINT IF EXISTS "InvoiceLineItems_invoice_id_Invoices_id_fk";
--> statement-breakpoint
ALTER TABLE "invoice_line_items" DROP CONSTRAINT IF EXISTS "InvoiceLineItems_variant_id_Variants_id_fk";
--> statement-breakpoint
ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "Invoices_purchase_id_Purchases_id_fk";
--> statement-breakpoint
ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "Invoices_billing_period_id_billing_periods_id_fk";
--> statement-breakpoint
ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "Invoices_customer_profile_id_customer_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "Invoices_organization_id_Organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "Invoices_owner_membership_id_Memberships_id_fk";
--> statement-breakpoint
ALTER TABLE "links" DROP CONSTRAINT IF EXISTS "Links_organization_id_Organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "links" DROP CONSTRAINT IF EXISTS "Links_ProductId_Products_id_fk";
--> statement-breakpoint
ALTER TABLE "memberships" DROP CONSTRAINT IF EXISTS "Memberships_organization_id_Organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "messages" DROP CONSTRAINT IF EXISTS "Messages_customer_profile_id_customer_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "messages" DROP CONSTRAINT IF EXISTS "Messages_OrganizationMemberId_Memberships_id_fk";
--> statement-breakpoint
ALTER TABLE "organizations" DROP CONSTRAINT IF EXISTS "Organizations_CountryId_countries_id_fk";
--> statement-breakpoint
ALTER TABLE "payment_methods" DROP CONSTRAINT IF EXISTS "PaymentMethods_customer_profile_id_customer_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "Payments_invoice_id_Invoices_id_fk";
--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "Payments_organization_id_Organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "Payments_customer_profile_id_customer_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "Payments_PurchaseId_Purchases_id_fk";
--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "Payments_billing_period_id_billing_periods_id_fk";
--> statement-breakpoint
ALTER TABLE "Products" DROP CONSTRAINT IF EXISTS "Products_organization_id_Organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "proper_nouns" DROP CONSTRAINT IF EXISTS "ProperNouns_organization_id_Organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "PurchaseAccessSessions" DROP CONSTRAINT IF EXISTS "PurchaseAccessSessions_PurchaseId_Purchases_id_fk";
--> statement-breakpoint
ALTER TABLE "purchases" DROP CONSTRAINT IF EXISTS "Purchases_customer_profile_id_customer_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "purchases" DROP CONSTRAINT IF EXISTS "Purchases_organization_id_Organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "purchases" DROP CONSTRAINT IF EXISTS "Purchases_variant_id_Variants_id_fk";
--> statement-breakpoint
ALTER TABLE "PurchaseSessions" DROP CONSTRAINT IF EXISTS "PurchaseSessions_variant_id_Variants_id_fk";
--> statement-breakpoint
ALTER TABLE "PurchaseSessions" DROP CONSTRAINT IF EXISTS "PurchaseSessions_purchase_id_Purchases_id_fk";
--> statement-breakpoint
ALTER TABLE "PurchaseSessions" DROP CONSTRAINT IF EXISTS "PurchaseSessions_invoice_id_Invoices_id_fk";
--> statement-breakpoint
ALTER TABLE "PurchaseSessions" DROP CONSTRAINT IF EXISTS "PurchaseSessions_organization_id_Organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "PurchaseSessions" DROP CONSTRAINT IF EXISTS "PurchaseSessions_discount_id_Discounts_id_fk";
--> statement-breakpoint
ALTER TABLE "subscription_items" DROP CONSTRAINT IF EXISTS "SubscriptionItems_variant_id_Variants_id_fk";
--> statement-breakpoint
ALTER TABLE "subscriptions" DROP CONSTRAINT IF EXISTS "Subscriptions_customer_profile_id_customer_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "subscriptions" DROP CONSTRAINT IF EXISTS "Subscriptions_organization_id_Organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "subscriptions" DROP CONSTRAINT IF EXISTS "Subscriptions_variant_id_Variants_id_fk";
--> statement-breakpoint
ALTER TABLE "variants" DROP CONSTRAINT IF EXISTS "Variants_ProductId_Products_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "DiscountRedemptions_discount_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "DiscountRedemptions_purchase_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "DiscountRedemptions_purchase_id_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Discounts_organization_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Discounts_code_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Discounts_code_organization_id_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Events_type_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Events_eventCategory_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Events_eventRetentionPolicy_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Events_subjectEntity_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Events_objectEntity_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Events_subjectEntity_subjectId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Events_objectEntity_objectId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Events_hash_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "FeeCalculations_organization_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "FeeCalculations_PurchaseSessionId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "FeeCalculations_PurchaseId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "FeeCalculations_discount_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Files_objectKey_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "FormFields_FormId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "FormFields_type_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Forms_organization_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Forms_ProductId_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "FormSubmissions_FormId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "FormSubmissions_UserId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Integrations_UserId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Integrations_organization_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Integrations_provider_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Integrations_status_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "IntegrationSessions_IntegrationId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "IntegrationSessions_state_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "InvoiceLineItems_invoice_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "InvoiceLineItems_variant_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Invoices_invoice_number_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Invoices_purchase_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Invoices_status_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Invoices_customer_profile_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Invoices_stripe_payment_intent_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Invoices_organization_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Links_organization_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Links_ProductId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Memberships_UserId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Memberships_organization_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Memberships_UserId_organization_id_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Messages_platformId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Messages_platformThreadId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Messages_platformId_platform_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Organizations_name_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Organizations_stripeAccountId_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Organizations_domain_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Organizations_CountryId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "PaymentMethods_customer_profile_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "PaymentMethods_type_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Payments_invoice_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Payments_organization_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Payments_paymentMethod_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Payments_customer_profile_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Payments_status_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Payments_currency_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Payments_PurchaseId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Payments_stripeChargeId_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Products_stripeProductId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "ProperNouns_organization_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "ProperNouns_EntityId_entityType_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "ProperNouns_entityType_EntityId_organization_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "ProperNouns_name_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "ProperNouns_EntityId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "PurchaseAccessSessions_PurchaseId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Purchases_customer_profile_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Purchases_organization_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Purchases_variant_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "SubscriptionItems_subscription_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "SubscriptionItems_variant_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Subscriptions_customer_profile_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Subscriptions_variant_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Subscriptions_status_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Subscriptions_stripeSetupIntentId_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Users_name_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Users_email_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Variants_priceType_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Variants_ProductId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Variants_stripePriceId_unique_idx";--> statement-breakpoint
ALTER TABLE "discount_redemptions" ADD CONSTRAINT "discount_redemptions_id_unique" UNIQUE("id");--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_id_unique" UNIQUE("id");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_id_unique" UNIQUE("id");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_hash_unique" UNIQUE("hash");--> statement-breakpoint
ALTER TABLE "fee_calculations" ADD CONSTRAINT "fee_calculations_id_unique" UNIQUE("id");--> statement-breakpoint
ALTER TABLE "Files" ADD CONSTRAINT "Files_object_key_unique" UNIQUE("object_key");--> statement-breakpoint
ALTER TABLE "form_fields" ADD CONSTRAINT "form_fields_id_unique" UNIQUE("id");--> statement-breakpoint
ALTER TABLE "forms" ADD CONSTRAINT "forms_id_unique" UNIQUE("id");--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_id_unique" UNIQUE("id");--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_id_unique" UNIQUE("id");--> statement-breakpoint
ALTER TABLE "integration_sessions" ADD CONSTRAINT "integration_sessions_id_unique" UNIQUE("id");--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_id_unique" UNIQUE("id");--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_id_unique" UNIQUE("id");--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_invoice_number_unique" UNIQUE("invoice_number");--> statement-breakpoint
ALTER TABLE "links" ADD CONSTRAINT "links_id_unique" UNIQUE("id");--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_id_unique" UNIQUE("id");--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_id_unique" UNIQUE("id");--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_id_unique" UNIQUE("id");--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_stripe_account_id_unique" UNIQUE("stripe_account_id");--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_domain_unique" UNIQUE("domain");--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_subdomain_slug_unique" UNIQUE("subdomain_slug");--> statement-breakpoint
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_id_unique" UNIQUE("id");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_id_unique" UNIQUE("id");--> statement-breakpoint
ALTER TABLE "Products" ADD CONSTRAINT "Products_stripe_product_id_unique" UNIQUE("stripe_product_id");--> statement-breakpoint
ALTER TABLE "proper_nouns" ADD CONSTRAINT "proper_nouns_id_unique" UNIQUE("id");--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_id_unique" UNIQUE("id");--> statement-breakpoint
ALTER TABLE "subscription_items" ADD CONSTRAINT "subscription_items_id_unique" UNIQUE("id");--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_id_unique" UNIQUE("id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_id_unique" UNIQUE("id");--> statement-breakpoint
ALTER TABLE "variants" ADD CONSTRAINT "variants_id_unique" UNIQUE("id");--> statement-breakpoint
ALTER TABLE "variants" ADD CONSTRAINT "variants_stripe_price_id_unique" UNIQUE("stripe_price_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "billing_period_items" ADD CONSTRAINT "billing_period_items_discount_redemption_id_discount_redemptions_id_fk" FOREIGN KEY ("discount_redemption_id") REFERENCES "public"."discount_redemptions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "billing_periods" ADD CONSTRAINT "billing_periods_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "billing_runs" ADD CONSTRAINT "billing_runs_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "billing_runs" ADD CONSTRAINT "billing_runs_payment_method_id_payment_methods_id_fk" FOREIGN KEY ("payment_method_id") REFERENCES "public"."payment_methods"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Customers" ADD CONSTRAINT "Customers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "discount_redemptions" ADD CONSTRAINT "discount_redemptions_discount_id_discounts_id_fk" FOREIGN KEY ("discount_id") REFERENCES "public"."discounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "discount_redemptions" ADD CONSTRAINT "discount_redemptions_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "discounts" ADD CONSTRAINT "discounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "events" ADD CONSTRAINT "events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fee_calculations" ADD CONSTRAINT "fee_calculations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fee_calculations" ADD CONSTRAINT "fee_calculations_purchase_session_id_PurchaseSessions_id_fk" FOREIGN KEY ("purchase_session_id") REFERENCES "public"."PurchaseSessions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fee_calculations" ADD CONSTRAINT "fee_calculations_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fee_calculations" ADD CONSTRAINT "fee_calculations_discount_id_discounts_id_fk" FOREIGN KEY ("discount_id") REFERENCES "public"."discounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fee_calculations" ADD CONSTRAINT "fee_calculations_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fee_calculations" ADD CONSTRAINT "fee_calculations_billing_period_id_billing_periods_id_fk" FOREIGN KEY ("billing_period_id") REFERENCES "public"."billing_periods"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Files" ADD CONSTRAINT "Files_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Files" ADD CONSTRAINT "Files_product_id_Products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."Products"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "form_fields" ADD CONSTRAINT "form_fields_form_id_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "forms" ADD CONSTRAINT "forms_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "forms" ADD CONSTRAINT "forms_product_id_Products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."Products"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_form_id_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "integrations" ADD CONSTRAINT "integrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "integrations" ADD CONSTRAINT "integrations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "integration_sessions" ADD CONSTRAINT "integration_sessions_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_billing_period_id_billing_periods_id_fk" FOREIGN KEY ("billing_period_id") REFERENCES "public"."billing_periods"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_profile_id_customer_profiles_id_fk" FOREIGN KEY ("customer_profile_id") REFERENCES "public"."customer_profiles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_owner_membership_id_memberships_id_fk" FOREIGN KEY ("owner_membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "links" ADD CONSTRAINT "links_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "links" ADD CONSTRAINT "links_product_id_Products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."Products"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "organization_member_id" TYPE text;--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_customer_profile_id_customer_profiles_id_fk" FOREIGN KEY ("customer_profile_id") REFERENCES "public"."customer_profiles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_organization_member_id_memberships_id_fk" FOREIGN KEY ("organization_member_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "organizations" ADD CONSTRAINT "organizations_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_customer_profile_id_customer_profiles_id_fk" FOREIGN KEY ("customer_profile_id") REFERENCES "public"."customer_profiles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_customer_profile_id_customer_profiles_id_fk" FOREIGN KEY ("customer_profile_id") REFERENCES "public"."customer_profiles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_payment_method_id_payment_methods_id_fk" FOREIGN KEY ("payment_method_id") REFERENCES "public"."payment_methods"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_billing_period_id_billing_periods_id_fk" FOREIGN KEY ("billing_period_id") REFERENCES "public"."billing_periods"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Products" ADD CONSTRAINT "Products_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "proper_nouns" ADD CONSTRAINT "proper_nouns_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "PurchaseAccessSessions" ADD CONSTRAINT "PurchaseAccessSessions_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchases" ADD CONSTRAINT "purchases_customer_profile_id_customer_profiles_id_fk" FOREIGN KEY ("customer_profile_id") REFERENCES "public"."customer_profiles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchases" ADD CONSTRAINT "purchases_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchases" ADD CONSTRAINT "purchases_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "PurchaseSessions" ADD CONSTRAINT "PurchaseSessions_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "PurchaseSessions" ADD CONSTRAINT "PurchaseSessions_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "PurchaseSessions" ADD CONSTRAINT "PurchaseSessions_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "PurchaseSessions" ADD CONSTRAINT "PurchaseSessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "PurchaseSessions" ADD CONSTRAINT "PurchaseSessions_discount_id_discounts_id_fk" FOREIGN KEY ("discount_id") REFERENCES "public"."discounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscription_items" ADD CONSTRAINT "subscription_items_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscription_items" ADD CONSTRAINT "subscription_items_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_customer_profile_id_customer_profiles_id_fk" FOREIGN KEY ("customer_profile_id") REFERENCES "public"."customer_profiles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_default_payment_method_id_payment_methods_id_fk" FOREIGN KEY ("default_payment_method_id") REFERENCES "public"."payment_methods"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_backup_payment_method_id_payment_methods_id_fk" FOREIGN KEY ("backup_payment_method_id") REFERENCES "public"."payment_methods"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "variants" ADD CONSTRAINT "variants_product_id_Products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."Products"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discount_redemptions_discount_id_idx" ON "discount_redemptions" USING btree ("discount_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discount_redemptions_purchase_id_idx" ON "discount_redemptions" USING btree ("purchase_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "discount_redemptions_purchase_id_unique_idx" ON "discount_redemptions" USING btree ("purchase_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discounts_organization_id_idx" ON "discounts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discounts_code_idx" ON "discounts" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "discounts_code_organization_id_unique_idx" ON "discounts" USING btree ("code","organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_type_idx" ON "events" USING btree ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_event_category_idx" ON "events" USING btree ("event_category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_event_retention_policy_idx" ON "events" USING btree ("event_retention_policy");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_subject_entity_idx" ON "events" USING btree ("subject_entity");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_object_entity_idx" ON "events" USING btree ("object_entity");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_subject_entity_subject_id_idx" ON "events" USING btree ("subject_entity","subject_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_object_entity_object_id_idx" ON "events" USING btree ("object_entity","object_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "events_hash_unique_idx" ON "events" USING btree ("hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fee_calculations_organization_id_idx" ON "fee_calculations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fee_calculations_purchase_session_id_idx" ON "fee_calculations" USING btree ("purchase_session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fee_calculations_purchase_id_idx" ON "fee_calculations" USING btree ("purchase_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fee_calculations_discount_id_idx" ON "fee_calculations" USING btree ("discount_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Files_object_key_unique_idx" ON "Files" USING btree ("object_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "form_fields_form_id_idx" ON "form_fields" USING btree ("form_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "form_fields_type_idx" ON "form_fields" USING btree ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "forms_organization_id_idx" ON "forms" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "forms_product_id_unique_idx" ON "forms" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "form_submissions_form_id_idx" ON "form_submissions" USING btree ("form_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "form_submissions_user_id_idx" ON "form_submissions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integrations_user_id_idx" ON "integrations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integrations_organization_id_idx" ON "integrations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integrations_provider_idx" ON "integrations" USING btree ("provider");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integrations_status_idx" ON "integrations" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integration_sessions_integration_id_idx" ON "integration_sessions" USING btree ("integration_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integration_sessions_state_idx" ON "integration_sessions" USING btree ("state");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_line_items_invoice_id_idx" ON "invoice_line_items" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_line_items_variant_id_idx" ON "invoice_line_items" USING btree ("variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_invoice_number_unique_idx" ON "invoices" USING btree ("invoice_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_purchase_id_idx" ON "invoices" USING btree ("purchase_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_status_idx" ON "invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_customer_profile_id_idx" ON "invoices" USING btree ("customer_profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_stripe_payment_intent_id_idx" ON "invoices" USING btree ("stripe_payment_intent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_organization_id_idx" ON "invoices" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "links_organization_id_idx" ON "links" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "links_product_id_idx" ON "links" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memberships_user_id_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memberships_organization_id_idx" ON "memberships" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "memberships_user_id_organization_id_unique_idx" ON "memberships" USING btree ("user_id","organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_platform_id_idx" ON "messages" USING btree ("platform_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_platform_thread_id_idx" ON "messages" USING btree ("platform_thread_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "messages_platform_id_platform_unique_idx" ON "messages" USING btree ("platform_id","platform");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organizations_name_idx" ON "organizations" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "organizations_stripe_account_id_unique_idx" ON "organizations" USING btree ("stripe_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "organizations_domain_unique_idx" ON "organizations" USING btree ("domain");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organizations_country_id_idx" ON "organizations" USING btree ("country_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_methods_customer_profile_id_idx" ON "payment_methods" USING btree ("customer_profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_methods_type_idx" ON "payment_methods" USING btree ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_invoice_id_idx" ON "payments" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_organization_id_idx" ON "payments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_payment_method_idx" ON "payments" USING btree ("payment_method");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_customer_profile_id_idx" ON "payments" USING btree ("customer_profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_status_idx" ON "payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_currency_idx" ON "payments" USING btree ("currency");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_purchase_id_idx" ON "payments" USING btree ("purchase_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payments_stripe_charge_id_unique_idx" ON "payments" USING btree ("stripe_charge_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Products_stripe_product_id_idx" ON "Products" USING btree ("stripe_product_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "proper_nouns_organization_id_idx" ON "proper_nouns" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "proper_nouns_entity_id_entity_type_unique_idx" ON "proper_nouns" USING btree ("entity_id","entity_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "proper_nouns_entity_type_entity_id_organization_id_idx" ON "proper_nouns" USING btree ("entity_type","entity_id","organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "proper_nouns_name_idx" ON "proper_nouns" USING btree ("name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "proper_nouns_entity_id_idx" ON "proper_nouns" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "PurchaseAccessSessions_purchase_id_idx" ON "PurchaseAccessSessions" USING btree ("purchase_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchases_customer_profile_id_idx" ON "purchases" USING btree ("customer_profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchases_organization_id_idx" ON "purchases" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchases_variant_id_idx" ON "purchases" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscription_items_subscription_id_idx" ON "subscription_items" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscription_items_variant_id_idx" ON "subscription_items" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriptions_customer_profile_id_idx" ON "subscriptions" USING btree ("customer_profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriptions_variant_id_idx" ON "subscriptions" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriptions_status_idx" ON "subscriptions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_stripe_setup_intent_id_unique_idx" ON "subscriptions" USING btree ("stripe_setup_intent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_name_idx" ON "users" USING btree ("name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "variants_price_type_idx" ON "variants" USING btree ("price_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "variants_product_id_idx" ON "variants" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "variants_stripe_price_id_unique_idx" ON "variants" USING btree ("stripe_price_id");--> statement-breakpoint
ALTER POLICY "Enable all actions for own organizations" ON "api_keys" TO authenticated USING ("organization_id" in (select "organization_id" from "memberships"));--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "billing_period_items" TO authenticated USING ("billing_period_id" in (select "id" from "billing_periods" where "subscription_id" in (select "id" from "subscriptions" where "organization_id" in (select "organization_id" from "memberships"))));--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "billing_periods" TO authenticated USING ("subscription_id" in (select "id" from "subscriptions" where "organization_id" in (select "organization_id" from "memberships")));--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "billing_runs" TO authenticated USING ("billing_period_id" in (select "id" from "billing_periods" where "subscription_id" in (select "id" from "subscriptions" where "organization_id" in (select "organization_id" from "memberships"))));--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "discount_redemptions" TO authenticated USING ("discount_id" in (select "discount_id" from "discounts" where "organization_id" in (select "organization_id" from "memberships")));--> statement-breakpoint
ALTER POLICY "Enable all actions for discounts in own organization" ON "discounts" TO authenticated USING ("organization_id" in (select "organization_id" from "memberships"));--> statement-breakpoint
ALTER POLICY "Enable all actions for own organization" ON "events" TO authenticated USING ("organization_id" in (select "organization_id" from "memberships"));--> statement-breakpoint
ALTER POLICY "Enable select for own organization" ON "fee_calculations" TO authenticated USING ("organization_id" in (select "organization_id" from "memberships"));--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "Files" TO authenticated USING ("organization_id" in (select "organization_id" from "memberships")) WITH CHECK ("product_id" is null OR "product_id" in (select "id" from "Products"));--> statement-breakpoint
ALTER POLICY "Enable all for own organizations" ON "forms" TO authenticated USING ("organization_id" in (select "organization_id" from "memberships")) WITH CHECK ("product_id" is null OR "product_id" in (select "id" from "Products"));--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "integrations" TO authenticated USING ("organization_id" in (select "organization_id" from "memberships") OR "user_id" = requesting_user_id());--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "links" TO authenticated USING ("organization_id" in (select "organization_id" from "memberships")) WITH CHECK ("product_id" is null OR "product_id" in (select "id" from "Products"));--> statement-breakpoint
ALTER POLICY "Enable select for own organization" ON "payments" TO authenticated USING ("organization_id" in (select "organization_id" from "memberships"));--> statement-breakpoint
ALTER POLICY "Enable update for own organization" ON "payments" TO authenticated USING ("organization_id" in (select "organization_id" from "memberships"));--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "Products" TO authenticated USING ("organization_id" in (select "organization_id" from "memberships"));--> statement-breakpoint
ALTER POLICY "Enable all actions for discounts in own organization" ON "PurchaseSessions" TO authenticated USING ("organization_id" in (select "organization_id" from "memberships"));--> statement-breakpoint
ALTER POLICY "Enable actions for own organizations via customer profiles" ON "subscriptions" TO authenticated USING ("customer_profile_id" in (select "id" from "customer_profiles"));--> statement-breakpoint
ALTER POLICY "Enable all for self organizations via products" ON "variants" TO authenticated USING ("product_id" in (select "id" from "Products"));