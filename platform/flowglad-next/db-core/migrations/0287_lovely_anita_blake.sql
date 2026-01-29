-- Migration: Add current_pricing_model_id() function and RESTRICTIVE RLS policies for PM scoping
-- This enables pricing model isolation for API key requests while allowing webapp/CLI fallback

-- Part 1: Create helper function to extract pricing_model_id from JWT claims
CREATE OR REPLACE FUNCTION current_pricing_model_id()
RETURNS text AS $$
BEGIN
    RETURN NULLIF(
        current_setting('request.jwt.claims', true)::json->>'pricing_model_id',
        ''
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- Part 2: Add RESTRICTIVE PM scoping policies to all 35 PM-scoped entities
-- The fallback pattern (current_pricing_model_id() IS NULL OR ...) allows:
-- - API keys: strict PM match when pricing_model_id is in JWT
-- - Webapp/CLI: falls back to org+livemode isolation when no PM in JWT

-- api_keys
CREATE POLICY "Enforce pricing model scope (api_keys)" ON "api_keys"
  AS RESTRICTIVE FOR ALL TO "merchant"
  USING (current_pricing_model_id() IS NULL OR pricing_model_id = current_pricing_model_id());

-- billing_period_items
CREATE POLICY "Enforce pricing model scope (billing_period_items)" ON "billing_period_items"
  AS RESTRICTIVE FOR ALL TO "merchant"
  USING (current_pricing_model_id() IS NULL OR pricing_model_id = current_pricing_model_id());

-- billing_periods
CREATE POLICY "Enforce pricing model scope (billing_periods)" ON "billing_periods"
  AS RESTRICTIVE FOR ALL TO "merchant"
  USING (current_pricing_model_id() IS NULL OR pricing_model_id = current_pricing_model_id());

-- billing_runs
CREATE POLICY "Enforce pricing model scope (billing_runs)" ON "billing_runs"
  AS RESTRICTIVE FOR ALL TO "merchant"
  USING (current_pricing_model_id() IS NULL OR pricing_model_id = current_pricing_model_id());

-- checkout_sessions
CREATE POLICY "Enforce pricing model scope (checkout_sessions)" ON "checkout_sessions"
  AS RESTRICTIVE FOR ALL TO "merchant"
  USING (current_pricing_model_id() IS NULL OR pricing_model_id = current_pricing_model_id());

-- customers
CREATE POLICY "Enforce pricing model scope (customers)" ON "customers"
  AS RESTRICTIVE FOR ALL TO "merchant"
  USING (current_pricing_model_id() IS NULL OR pricing_model_id = current_pricing_model_id());

-- discount_redemptions
CREATE POLICY "Enforce pricing model scope (discount_redemptions)" ON "discount_redemptions"
  AS RESTRICTIVE FOR ALL TO "merchant"
  USING (current_pricing_model_id() IS NULL OR pricing_model_id = current_pricing_model_id());

-- discounts
CREATE POLICY "Enforce pricing model scope (discounts)" ON "discounts"
  AS RESTRICTIVE FOR ALL TO "merchant"
  USING (current_pricing_model_id() IS NULL OR pricing_model_id = current_pricing_model_id());

-- events
CREATE POLICY "Enforce pricing model scope (events)" ON "events"
  AS RESTRICTIVE FOR ALL TO "merchant"
  USING (current_pricing_model_id() IS NULL OR pricing_model_id = current_pricing_model_id());

-- features
CREATE POLICY "Enforce pricing model scope (features)" ON "features"
  AS RESTRICTIVE FOR ALL TO "merchant"
  USING (current_pricing_model_id() IS NULL OR pricing_model_id = current_pricing_model_id());

-- fee_calculations
CREATE POLICY "Enforce pricing model scope (fee_calculations)" ON "fee_calculations"
  AS RESTRICTIVE FOR ALL TO "merchant"
  USING (current_pricing_model_id() IS NULL OR pricing_model_id = current_pricing_model_id());

-- invoice_line_items
CREATE POLICY "Enforce pricing model scope (invoice_line_items)" ON "invoice_line_items"
  AS RESTRICTIVE FOR ALL TO "merchant"
  USING (current_pricing_model_id() IS NULL OR pricing_model_id = current_pricing_model_id());

-- invoices
CREATE POLICY "Enforce pricing model scope (invoices)" ON "invoices"
  AS RESTRICTIVE FOR ALL TO "merchant"
  USING (current_pricing_model_id() IS NULL OR pricing_model_id = current_pricing_model_id());

-- ledger_accounts
CREATE POLICY "Enforce pricing model scope (ledger_accounts)" ON "ledger_accounts"
  AS RESTRICTIVE FOR ALL TO "merchant"
  USING (current_pricing_model_id() IS NULL OR pricing_model_id = current_pricing_model_id());

-- ledger_entries
CREATE POLICY "Enforce pricing model scope (ledger_entries)" ON "ledger_entries"
  AS RESTRICTIVE FOR ALL TO "merchant"
  USING (current_pricing_model_id() IS NULL OR pricing_model_id = current_pricing_model_id());

-- ledger_transactions
CREATE POLICY "Enforce pricing model scope (ledger_transactions)" ON "ledger_transactions"
  AS RESTRICTIVE FOR ALL TO "merchant"
  USING (current_pricing_model_id() IS NULL OR pricing_model_id = current_pricing_model_id());

-- payment_methods
CREATE POLICY "Enforce pricing model scope (payment_methods)" ON "payment_methods"
  AS RESTRICTIVE FOR ALL TO "merchant"
  USING (current_pricing_model_id() IS NULL OR pricing_model_id = current_pricing_model_id());

-- payments
CREATE POLICY "Enforce pricing model scope (payments)" ON "payments"
  AS RESTRICTIVE FOR ALL TO "merchant"
  USING (current_pricing_model_id() IS NULL OR pricing_model_id = current_pricing_model_id());

-- prices
CREATE POLICY "Enforce pricing model scope (prices)" ON "prices"
  AS RESTRICTIVE FOR ALL TO "merchant"
  USING (current_pricing_model_id() IS NULL OR pricing_model_id = current_pricing_model_id());

-- product_features
CREATE POLICY "Enforce pricing model scope (product_features)" ON "product_features"
  AS RESTRICTIVE FOR ALL TO "merchant"
  USING (current_pricing_model_id() IS NULL OR pricing_model_id = current_pricing_model_id());

-- products
CREATE POLICY "Enforce pricing model scope (products)" ON "products"
  AS RESTRICTIVE FOR ALL TO "merchant"
  USING (current_pricing_model_id() IS NULL OR pricing_model_id = current_pricing_model_id());

-- purchases
CREATE POLICY "Enforce pricing model scope (purchases)" ON "purchases"
  AS RESTRICTIVE FOR ALL TO "merchant"
  USING (current_pricing_model_id() IS NULL OR pricing_model_id = current_pricing_model_id());

-- refunds
CREATE POLICY "Enforce pricing model scope (refunds)" ON "refunds"
  AS RESTRICTIVE FOR ALL TO "merchant"
  USING (current_pricing_model_id() IS NULL OR pricing_model_id = current_pricing_model_id());

-- resource_claims
CREATE POLICY "Enforce pricing model scope (resource_claims)" ON "resource_claims"
  AS RESTRICTIVE FOR ALL TO "merchant"
  USING (current_pricing_model_id() IS NULL OR pricing_model_id = current_pricing_model_id());

-- resources
CREATE POLICY "Enforce pricing model scope (resources)" ON "resources"
  AS RESTRICTIVE FOR ALL TO "merchant"
  USING (current_pricing_model_id() IS NULL OR pricing_model_id = current_pricing_model_id());

-- subscription_item_features
CREATE POLICY "Enforce pricing model scope (subscription_item_features)" ON "subscription_item_features"
  AS RESTRICTIVE FOR ALL TO "merchant"
  USING (current_pricing_model_id() IS NULL OR pricing_model_id = current_pricing_model_id());

-- subscription_items
CREATE POLICY "Enforce pricing model scope (subscription_items)" ON "subscription_items"
  AS RESTRICTIVE FOR ALL TO "merchant"
  USING (current_pricing_model_id() IS NULL OR pricing_model_id = current_pricing_model_id());

-- subscription_meter_period_calculations
CREATE POLICY "Enforce pricing model scope (subscription_meter_period_calculations)" ON "subscription_meter_period_calculations"
  AS RESTRICTIVE FOR ALL TO "merchant"
  USING (current_pricing_model_id() IS NULL OR pricing_model_id = current_pricing_model_id());

-- subscriptions
CREATE POLICY "Enforce pricing model scope (subscriptions)" ON "subscriptions"
  AS RESTRICTIVE FOR ALL TO "merchant"
  USING (current_pricing_model_id() IS NULL OR pricing_model_id = current_pricing_model_id());

-- usage_credit_applications
CREATE POLICY "Enforce pricing model scope (usage_credit_applications)" ON "usage_credit_applications"
  AS RESTRICTIVE FOR ALL TO "merchant"
  USING (current_pricing_model_id() IS NULL OR pricing_model_id = current_pricing_model_id());

-- usage_credit_balance_adjustments
CREATE POLICY "Enforce pricing model scope (usage_credit_balance_adjustments)" ON "usage_credit_balance_adjustments"
  AS RESTRICTIVE FOR ALL TO "merchant"
  USING (current_pricing_model_id() IS NULL OR pricing_model_id = current_pricing_model_id());

-- usage_credits
CREATE POLICY "Enforce pricing model scope (usage_credits)" ON "usage_credits"
  AS RESTRICTIVE FOR ALL TO "merchant"
  USING (current_pricing_model_id() IS NULL OR pricing_model_id = current_pricing_model_id());

-- usage_events
CREATE POLICY "Enforce pricing model scope (usage_events)" ON "usage_events"
  AS RESTRICTIVE FOR ALL TO "merchant"
  USING (current_pricing_model_id() IS NULL OR pricing_model_id = current_pricing_model_id());

-- usage_meters
CREATE POLICY "Enforce pricing model scope (usage_meters)" ON "usage_meters"
  AS RESTRICTIVE FOR ALL TO "merchant"
  USING (current_pricing_model_id() IS NULL OR pricing_model_id = current_pricing_model_id());

-- webhooks
CREATE POLICY "Enforce pricing model scope (webhooks)" ON "webhooks"
  AS RESTRICTIVE FOR ALL TO "merchant"
  USING (current_pricing_model_id() IS NULL OR pricing_model_id = current_pricing_model_id());
