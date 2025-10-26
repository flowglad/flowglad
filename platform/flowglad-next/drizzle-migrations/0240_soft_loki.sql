ALTER TABLE "api_keys" ADD COLUMN "hash_text" text;--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Check mode (api_keys)' AND tablename = 'api_keys'
    ) THEN
        ALTER POLICY "Check mode" ON "api_keys" RENAME TO "Check mode (api_keys)";
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Check mode (billing_period_items)' AND tablename = 'billing_period_items'
    ) THEN
        ALTER POLICY "Check mode" ON "billing_period_items" RENAME TO "Check mode (billing_period_items)";
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Check mode (billing_periods)' AND tablename = 'billing_periods'
    ) THEN
        ALTER POLICY "Check mode" ON "billing_periods" RENAME TO "Check mode (billing_periods)";
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Check mode (billing_runs)' AND tablename = 'billing_runs'
    ) THEN
        ALTER POLICY "Check mode" ON "billing_runs" RENAME TO "Check mode (billing_runs)";
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Enable select for customer' AND tablename = 'checkout_sessions'
    ) THEN
        ALTER POLICY "Check mode" ON "checkout_sessions" RENAME TO "Enable select for customer";
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Check mode (customers)' AND tablename = 'customers'
    ) THEN
        ALTER POLICY "Check mode" ON "customers" RENAME TO "Check mode (customers)";
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Check mode (discount_redemptions)' AND tablename = 'discount_redemptions'
    ) THEN
        ALTER POLICY "Check mode" ON "discount_redemptions" RENAME TO "Check mode (discount_redemptions)";
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Check mode (discounts)' AND tablename = 'discounts'
    ) THEN
        ALTER POLICY "Check mode" ON "discounts" RENAME TO "Check mode (discounts)";
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Check mode (events)' AND tablename = 'events'
    ) THEN
        ALTER POLICY "Check mode" ON "events" RENAME TO "Check mode (events)";
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Check mode (features)' AND tablename = 'features'
    ) THEN
        ALTER POLICY "Check mode" ON "features" RENAME TO "Check mode (features)";
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Check mode (fee_calculations)' AND tablename = 'fee_calculations'
    ) THEN
        ALTER POLICY "Check mode" ON "fee_calculations" RENAME TO "Check mode (fee_calculations)";
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Check mode (files)' AND tablename = 'files'
    ) THEN
        ALTER POLICY "Check mode" ON "files" RENAME TO "Check mode (files)";
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Check mode (invoice_line_items)' AND tablename = 'invoice_line_items'
    ) THEN
        ALTER POLICY "Check mode" ON "invoice_line_items" RENAME TO "Check mode (invoice_line_items)";
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Check mode (invoices)' AND tablename = 'invoices'
    ) THEN
        ALTER POLICY "Check mode" ON "invoices" RENAME TO "Check mode (invoices)";
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Check mode (ledger_accounts)' AND tablename = 'ledger_accounts'
    ) THEN
        ALTER POLICY "Check mode" ON "ledger_accounts" RENAME TO "Check mode (ledger_accounts)";
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Check mode (ledger_entries)' AND tablename = 'ledger_entries'
    ) THEN
        ALTER POLICY "Check mode" ON "ledger_entries" RENAME TO "Check mode (ledger_entries)";
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Check mode (ledger_transactions)' AND tablename = 'ledger_transactions'
    ) THEN
        ALTER POLICY "Check mode" ON "ledger_transactions" RENAME TO "Check mode (ledger_transactions)";
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Check mode (links)' AND tablename = 'links'
    ) THEN
        ALTER POLICY "Check mode" ON "links" RENAME TO "Check mode (links)";
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Check mode (messages)' AND tablename = 'messages'
    ) THEN
        ALTER POLICY "Check mode" ON "messages" RENAME TO "Check mode (messages)";
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Check mode (payment_methods)' AND tablename = 'payment_methods'
    ) THEN
        ALTER POLICY "Check mode" ON "payment_methods" RENAME TO "Check mode (payment_methods)";
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Check mode (payments)' AND tablename = 'payments'
    ) THEN
        ALTER POLICY "Check mode" ON "payments" RENAME TO "Check mode (payments)";
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Check mode (prices)' AND tablename = 'prices'
    ) THEN
        ALTER POLICY "Check mode" ON "prices" RENAME TO "Check mode (prices)";
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Check mode (pricing_models)' AND tablename = 'pricing_models'
    ) THEN
        ALTER POLICY "Check mode" ON "pricing_models" RENAME TO "Check mode (pricing_models)";
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Check mode (product_features)' AND tablename = 'product_features'
    ) THEN
        ALTER POLICY "Check mode" ON "product_features" RENAME TO "Check mode (product_features)";
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Check mode (products)' AND tablename = 'products'
    ) THEN
        ALTER POLICY "Check mode" ON "products" RENAME TO "Check mode (products)";
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Check mode (proper_nouns)' AND tablename = 'proper_nouns'
    ) THEN
        ALTER POLICY "Check mode" ON "proper_nouns" RENAME TO "Check mode (proper_nouns)";
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Check mode (purchase_access_sessions)' AND tablename = 'purchase_access_sessions'
    ) THEN
        ALTER POLICY "Check mode" ON "purchase_access_sessions" RENAME TO "Check mode (purchase_access_sessions)";
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Check mode (purchases)' AND tablename = 'purchases'
    ) THEN
        ALTER POLICY "Check mode" ON "purchases" RENAME TO "Check mode (purchases)";
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Check mode (refunds)' AND tablename = 'refunds'
    ) THEN
        ALTER POLICY "Check mode" ON "refunds" RENAME TO "Check mode (refunds)";
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Check mode (subscription_item_features)' AND tablename = 'subscription_item_features'
    ) THEN
        ALTER POLICY "Check mode" ON "subscription_item_features" RENAME TO "Check mode (subscription_item_features)";
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Check mode (subscription_items)' AND tablename = 'subscription_items'
    ) THEN
        ALTER POLICY "Check mode" ON "subscription_items" RENAME TO "Check mode (subscription_items)";
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Check mode (subscription_meter_period_calculations)' AND tablename = 'subscription_meter_period_calculations'
    ) THEN
        ALTER POLICY "Check mode" ON "subscription_meter_period_calculations" RENAME TO "Check mode (subscription_meter_period_calculations)";
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Check mode (subscriptions)' AND tablename = 'subscriptions'
    ) THEN
        ALTER POLICY "Check mode" ON "subscriptions" RENAME TO "Check mode (subscriptions)";
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Check mode (usage_credit_applications)' AND tablename = 'usage_credit_applications'
    ) THEN
        ALTER POLICY "Check mode" ON "usage_credit_applications" RENAME TO "Check mode (usage_credit_applications)";
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Check mode (usage_credit_balance_adjustments)' AND tablename = 'usage_credit_balance_adjustments'
    ) THEN
        ALTER POLICY "Check mode" ON "usage_credit_balance_adjustments" RENAME TO "Check mode (usage_credit_balance_adjustments)";
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Check mode (usage_credits)' AND tablename = 'usage_credits'
    ) THEN
        ALTER POLICY "Check mode" ON "usage_credits" RENAME TO "Check mode (usage_credits)";
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Check mode (usage_events)' AND tablename = 'usage_events'
    ) THEN
        ALTER POLICY "Check mode" ON "usage_events" RENAME TO "Check mode (usage_events)";
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Check mode (usage_meters)' AND tablename = 'usage_meters'
    ) THEN
        ALTER POLICY "Check mode" ON "usage_meters" RENAME TO "Check mode (usage_meters)";
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Check mode (webhooks)' AND tablename = 'webhooks'
    ) THEN
        ALTER POLICY "Check mode" ON "webhooks" RENAME TO "Check mode (webhooks)";
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Check mode (checkout_sessions)' AND tablename = 'checkout_sessions'
    ) THEN
        CREATE POLICY "Check mode (checkout_sessions)" ON "checkout_sessions" AS RESTRICTIVE FOR ALL TO "merchant" USING (current_setting('app.livemode')::boolean = livemode);
    END IF;
END $$;
