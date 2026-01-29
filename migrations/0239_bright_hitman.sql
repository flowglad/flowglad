DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'api_keys',
    'billing_period_items',
    'billing_periods',
    'billing_runs',
    'checkout_sessions',
    'customers',
    'discount_redemptions',
    'discounts',
    'events',
    'features',
    'fee_calculations',
    'files',
    'invoice_line_items',
    'invoices',
    'ledger_accounts',
    'ledger_entries',
    'ledger_transactions',
    'links',
    'messages',
    'payment_methods',
    'payments',
    'prices',
    'pricing_models',
    'product_features',
    'products',
    'proper_nouns',
    'purchase_access_sessions',
    'purchases',
    'refunds',
    'subscription_item_features',
    'subscription_items',
    'subscription_meter_period_calculations',
    'subscriptions',
    'usage_credit_applications',
    'usage_credit_balance_adjustments',
    'usage_credits',
    'usage_events',
    'usage_meters',
    'webhooks'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = t
        AND policyname = 'Check mode (' || t || ')'
    ) AND EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = t
        AND policyname = 'Check mode'
    ) THEN
      EXECUTE format('ALTER POLICY %I ON %I RENAME TO %I', 'Check mode', t, 'Check mode (' || t || ')');
    END IF;
  END LOOP;
END
$$ LANGUAGE plpgsql;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'checkout_sessions'
      AND policyname = 'Enable select for customer'
  ) THEN
    CREATE POLICY "Enable select for customer" ON "checkout_sessions" AS PERMISSIVE FOR SELECT TO "customer" USING ("customer_id" in (select id from "customers") and "organization_id" = current_organization_id());
  END IF;
END
$$ LANGUAGE plpgsql;--> statement-breakpoint