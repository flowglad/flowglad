DO $$ BEGIN
    CREATE ROLE "authenticated";
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

GRANT customer TO current_user;

CREATE POLICY "Enable read for customers (countries)" ON "countries" AS PERMISSIVE FOR SELECT TO "customer" USING (true);--> statement-breakpoint
CREATE POLICY "Enable read for customers (customers)" ON "customers" AS PERMISSIVE FOR SELECT TO "customer" USING ("user_id" = requesting_user_id());--> statement-breakpoint
CREATE POLICY "Enable read for customers (discount_redemptions)" ON "discount_redemptions" AS PERMISSIVE FOR SELECT TO "customer" USING ("subscription_id" in (select "id" from "subscriptions"));--> statement-breakpoint
CREATE POLICY "Enable read for customers (discounts)" ON "discounts" AS PERMISSIVE FOR SELECT TO "customer" USING ("organization_id" in (select "id" from "organizations") and "active" = true);--> statement-breakpoint
CREATE POLICY "Enable read for customers (features)" ON "features" AS PERMISSIVE FOR SELECT TO "customer" USING ("organization_id" in (select "id" from "organizations") and "active" = true);--> statement-breakpoint
CREATE POLICY "Enable read for customers (invoice_line_items)" ON "invoice_line_items" AS PERMISSIVE FOR SELECT TO "customer" USING ("invoice_id" in (select "id" from "invoices"));--> statement-breakpoint
CREATE POLICY "Enable read for customers (invoices)" ON "invoices" AS PERMISSIVE FOR SELECT TO "customer" USING ("customer_id" in (select "id" from "customers"));--> statement-breakpoint
CREATE POLICY "Enable read for customers (payment_methods)" ON "payment_methods" AS PERMISSIVE FOR SELECT TO "customer" USING ("customer_id" in (select "id" from "customers"));--> statement-breakpoint
CREATE POLICY "Enable read for customers (payments)" ON "payments" AS PERMISSIVE FOR SELECT TO "customer" USING ("customer_id" in (select "id" from "customers"));--> statement-breakpoint
CREATE POLICY "Enable read for customers (prices)" ON "prices" AS PERMISSIVE FOR SELECT TO "customer" USING ("product_id" in (select "id" from "products") and "active" = true);--> statement-breakpoint
CREATE POLICY "Enable read for customers (pricing_models)" ON "pricing_models" AS PERMISSIVE FOR SELECT TO "customer" USING ("id" in (select "pricing_model_id" from "customers"));--> statement-breakpoint
CREATE POLICY "Enable read for customers (product_features)" ON "product_features" AS PERMISSIVE FOR SELECT TO "customer" USING ("product_id" in (select "id" from "products"));--> statement-breakpoint
CREATE POLICY "Enable read for customers (products)" ON "products" AS PERMISSIVE FOR SELECT TO "customer" USING ("organization_id" in (select "organization_id" from "customers") and "active" = true and "pricing_model_id" in (select "pricing_model_id" from "customers"));--> statement-breakpoint
CREATE POLICY "Enable read for customers (purchases)" ON "purchases" AS PERMISSIVE FOR SELECT TO "customer" USING ("customer_id" in (select "id" from "customers"));--> statement-breakpoint
CREATE POLICY "Enable read for customers (refunds)" ON "refunds" AS PERMISSIVE FOR SELECT TO "customer" USING ("payment_id" in (select "id" from "payments"));--> statement-breakpoint
CREATE POLICY "Enable read for customers (subscription_item_features)" ON "subscription_item_features" AS PERMISSIVE FOR SELECT TO "customer" USING ("subscription_item_id" in (select "id" from "subscription_items") and "feature_id" in (select "id" from "features"));--> statement-breakpoint
CREATE POLICY "Enable read for customers (subscription_items)" ON "subscription_items" AS PERMISSIVE FOR SELECT TO "customer" USING ("subscription_id" in (select "id" from "subscriptions"));--> statement-breakpoint
CREATE POLICY "Enable read for customers (subscriptions)" ON "subscriptions" AS PERMISSIVE FOR SELECT TO "customer" USING ("customer_id" in (select "id" from "customers"));--> statement-breakpoint
CREATE POLICY "Enable read for customers (usage_credit_applications)" ON "usage_credit_applications" AS PERMISSIVE FOR SELECT TO "customer" USING ("usage_credit_id" in (select "id" from "usage_credits"));--> statement-breakpoint
CREATE POLICY "Enable read for customers (usage_credit_balance_adjustments)" ON "usage_credit_balance_adjustments" AS PERMISSIVE FOR SELECT TO "customer" USING ("adjusted_usage_credit_id" in (select "id" from "usage_credits"));--> statement-breakpoint
CREATE POLICY "Enable read for customers (usage_credits)" ON "usage_credits" AS PERMISSIVE FOR SELECT TO "customer" USING ("subscription_id" in (select "id" from "subscriptions"));--> statement-breakpoint
CREATE POLICY "Enable read for customers (usage_events)" ON "usage_events" AS PERMISSIVE FOR SELECT TO "customer" USING ("customer_id" in (select "id" from "customers"));--> statement-breakpoint
CREATE POLICY "Enable read for customers (usage_meters)" ON "usage_meters" AS PERMISSIVE FOR SELECT TO "customer" USING ("pricing_model_id" in (select "pricing_model_id" from "customers"));