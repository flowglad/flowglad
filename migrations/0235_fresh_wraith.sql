DO $$ BEGIN
    CREATE ROLE "customer";
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE OR REPLACE FUNCTION current_organization_id()
RETURNS text AS $$
BEGIN
    RETURN NULLIF(
        current_setting('request.jwt.claims', true)::json->>'organization_id',
        ''
    )::text;
END;
$$ LANGUAGE plpgsql;

DO
$$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_roles WHERE rolname = 'customer'
    ) THEN
        CREATE ROLE "customer";
    END IF;
END
$$;

DO
$$
DECLARE
    table_name text;
BEGIN
    FOR table_name IN
        SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    LOOP
        EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE public.%I TO customer', table_name);
    END LOOP;
END
$$;

DO
$$
DECLARE
    seq_name text;
BEGIN
    FOR seq_name IN
        SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public'
    LOOP
        EXECUTE format('GRANT USAGE, UPDATE ON SEQUENCE public.%I TO customer', seq_name);
    END LOOP;
END
$$;

CREATE INDEX IF NOT EXISTS "memberships_user_id_focused_idx" ON "memberships" USING btree ("user_id","focused");--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'countries' AND policyname = 'Enable read for customers (countries)'
    ) THEN
        CREATE POLICY "Enable read for customers (countries)" ON "countries" AS PERMISSIVE FOR SELECT TO "customer" USING (true);
    END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'customers' AND policyname = 'Enable read for customers (customers)'
    ) THEN
        CREATE POLICY "Enable read for customers (customers)" ON "customers" AS PERMISSIVE FOR SELECT TO "customer" USING ("user_id" = requesting_user_id() AND "organization_id" = current_organization_id());
    END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'discount_redemptions' AND policyname = 'Enable read for customers (discount_redemptions)'
    ) THEN
        CREATE POLICY "Enable read for customers (discount_redemptions)" ON "discount_redemptions" AS PERMISSIVE FOR SELECT TO "customer" USING ("subscription_id" in (select "id" from "subscriptions"));
    END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'discounts' AND policyname = 'Enable read for customers (discounts)'
    ) THEN
        CREATE POLICY "Enable read for customers (discounts)" ON "discounts" AS PERMISSIVE FOR SELECT TO "customer" USING ("organization_id" = current_organization_id() and "active" = true);
    END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'features' AND policyname = 'Enable read for customers (features)'
    ) THEN
        CREATE POLICY "Enable read for customers (features)" ON "features" AS PERMISSIVE FOR SELECT TO "customer" USING ("organization_id" = current_organization_id() and "active" = true);
    END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'invoice_line_items' AND policyname = 'Enable read for customers (invoice_line_items)'
    ) THEN
        CREATE POLICY "Enable read for customers (invoice_line_items)" ON "invoice_line_items" AS PERMISSIVE FOR SELECT TO "customer" USING ("invoice_id" in (select "id" from "invoices"));
    END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'invoices' AND policyname = 'Enable read for customers (invoices)'
    ) THEN
        CREATE POLICY "Enable read for customers (invoices)" ON "invoices" AS PERMISSIVE FOR SELECT TO "customer" USING ("customer_id" in (select "id" from "customers"));
    END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'payment_methods' AND policyname = 'Enable read for customers (payment_methods)'
    ) THEN
        CREATE POLICY "Enable read for customers (payment_methods)" ON "payment_methods" AS PERMISSIVE FOR SELECT TO "customer" USING ("customer_id" in (select "id" from "customers"));
    END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'payments' AND policyname = 'Enable read for customers (payments)'
    ) THEN
        CREATE POLICY "Enable read for customers (payments)" ON "payments" AS PERMISSIVE FOR SELECT TO "customer" USING ("customer_id" in (select "id" from "customers"));
    END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'prices' AND policyname = 'Enable read for customers (prices)'
    ) THEN
        CREATE POLICY "Enable read for customers (prices)" ON "prices" AS PERMISSIVE FOR SELECT TO "customer" USING ("product_id" in (select "id" from "products") and "active" = true);
    END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'pricing_models' AND policyname = 'Enable read for customers (pricing_models)'
    ) THEN
        CREATE POLICY "Enable read for customers (pricing_models)" ON "pricing_models" AS PERMISSIVE FOR SELECT TO "customer" USING ("id" in (select "pricing_model_id" from "customers"));
    END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'product_features' AND policyname = 'Enable read for customers (product_features)'
    ) THEN
        CREATE POLICY "Enable read for customers (product_features)" ON "product_features" AS PERMISSIVE FOR SELECT TO "customer" USING ("product_id" in (select "id" from "products"));
    END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'products' AND policyname = 'Enable read for customers (products)'
    ) THEN
        CREATE POLICY "Enable read for customers (products)" ON "products" AS PERMISSIVE FOR SELECT TO "customer" USING ("organization_id" = current_organization_id() and "active" = true and "pricing_model_id" in (select "pricing_model_id" from "customers"));
    END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'purchases' AND policyname = 'Enable read for customers (purchases)'
    ) THEN
        CREATE POLICY "Enable read for customers (purchases)" ON "purchases" AS PERMISSIVE FOR SELECT TO "customer" USING ("customer_id" in (select "id" from "customers"));
    END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'refunds' AND policyname = 'Enable read for customers (refunds)'
    ) THEN
        CREATE POLICY "Enable read for customers (refunds)" ON "refunds" AS PERMISSIVE FOR SELECT TO "customer" USING ("payment_id" in (select "id" from "payments"));
    END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'subscription_item_features' AND policyname = 'Enable read for customers (subscription_item_features)'
    ) THEN
        CREATE POLICY "Enable read for customers (subscription_item_features)" ON "subscription_item_features" AS PERMISSIVE FOR SELECT TO "customer" USING ("subscription_item_id" in (select "id" from "subscription_items") and "feature_id" in (select "id" from "features"));
    END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'subscription_items' AND policyname = 'Enable read for customers (subscription_items)'
    ) THEN
        CREATE POLICY "Enable read for customers (subscription_items)" ON "subscription_items" AS PERMISSIVE FOR SELECT TO "customer" USING ("subscription_id" in (select "id" from "subscriptions"));
    END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'subscriptions' AND policyname = 'Enable read for customers (subscriptions)'
    ) THEN
        CREATE POLICY "Enable read for customers (subscriptions)" ON "subscriptions" AS PERMISSIVE FOR SELECT TO "customer" USING ("customer_id" in (select "id" from "customers"));
    END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'usage_credit_applications' AND policyname = 'Enable read for customers (usage_credit_applications)'
    ) THEN
        CREATE POLICY "Enable read for customers (usage_credit_applications)" ON "usage_credit_applications" AS PERMISSIVE FOR SELECT TO "customer" USING ("usage_credit_id" in (select "id" from "usage_credits"));
    END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'usage_credit_balance_adjustments' AND policyname = 'Enable read for customers (usage_credit_balance_adjustments)'
    ) THEN
        CREATE POLICY "Enable read for customers (usage_credit_balance_adjustments)" ON "usage_credit_balance_adjustments" AS PERMISSIVE FOR SELECT TO "customer" USING ("adjusted_usage_credit_id" in (select "id" from "usage_credits"));
    END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'usage_credits' AND policyname = 'Enable read for customers (usage_credits)'
    ) THEN
        CREATE POLICY "Enable read for customers (usage_credits)" ON "usage_credits" AS PERMISSIVE FOR SELECT TO "customer" USING ("subscription_id" in (select "id" from "subscriptions"));
    END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'usage_events' AND policyname = 'Enable read for customers (usage_events)'
    ) THEN
        CREATE POLICY "Enable read for customers (usage_events)" ON "usage_events" AS PERMISSIVE FOR SELECT TO "customer" USING ("customer_id" in (select "id" from "customers"));
    END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'usage_meters' AND policyname = 'Enable read for customers (usage_meters)'
    ) THEN
        CREATE POLICY "Enable read for customers (usage_meters)" ON "usage_meters" AS PERMISSIVE FOR SELECT TO "customer" USING ("pricing_model_id" in (select "pricing_model_id" from "customers"));
    END IF;
END $$;--> statement-breakpoint
ALTER POLICY "Enable read for own organizations (billing_period_items)" ON "billing_period_items" TO merchant USING ("billing_period_id" in (select "id" from "billing_periods" where "subscription_id" in (select "id" from "subscriptions" where "organization_id" in (select "organization_id" from "memberships"))));--> statement-breakpoint
ALTER POLICY "Enable read for own organizations (billing_runs)" ON "billing_runs" TO merchant USING ("billing_period_id" in (select "id" from "billing_periods" where "subscription_id" in (select "id" from "subscriptions" where "organization_id" in (select "organization_id" from "memberships"))));