DO
$$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_roles WHERE rolname = 'merchant'
    ) THEN
        CREATE ROLE "merchant";
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
        EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE public.%I TO merchant', table_name);
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
        EXECUTE format('GRANT USAGE, UPDATE ON SEQUENCE public.%I TO merchant', seq_name);
    END LOOP;
END
$$;

-- Set default privileges for tables created in the public schema
ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT SELECT, INSERT, UPDATE ON TABLES TO merchant;

ALTER POLICY "Enable all actions for own organizations" ON "api_keys" TO merchant USING ("organization_id" in (select "organization_id" from "memberships"));--> statement-breakpoint
ALTER POLICY "Check mode" ON "api_keys" TO merchant USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "billing_period_items" TO merchant USING ("billing_period_id" in (select "id" from "billing_periods" where "subscription_id" in (select "id" from "subscriptions" where "organization_id" in (select "organization_id" from "memberships"))));--> statement-breakpoint
ALTER POLICY "Check mode" ON "billing_period_items" TO merchant USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "billing_periods" TO merchant USING ("subscription_id" in (select "id" from "subscriptions" where "organization_id" in (select "organization_id" from "memberships")));--> statement-breakpoint
ALTER POLICY "Check mode" ON "billing_periods" TO merchant USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "billing_runs" TO merchant USING ("billing_period_id" in (select "id" from "billing_periods" where "subscription_id" in (select "id" from "subscriptions" where "organization_id" in (select "organization_id" from "memberships"))));--> statement-breakpoint
ALTER POLICY "Check mode" ON "billing_runs" TO merchant USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
ALTER POLICY "Check mode" ON "checkout_sessions" TO merchant USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
ALTER POLICY "Enable all actions for discounts in own organization" ON "checkout_sessions" TO merchant USING ("organization_id" in (select "organization_id" from "memberships"));--> statement-breakpoint
ALTER POLICY "Enable all actions for own organizations" ON "customers" TO merchant USING ("organization_id" in (select "organization_id" from "memberships"));--> statement-breakpoint
ALTER POLICY "Disallow deletion" ON "customers" TO merchant USING (false);--> statement-breakpoint
ALTER POLICY "Check mode" ON "customers" TO merchant USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
ALTER POLICY "Check mode" ON "discount_redemptions" TO merchant USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "discount_redemptions" TO merchant USING ("discount_id" in (select "discount_id" from "discounts" where "organization_id" in (select "organization_id" from "memberships")));--> statement-breakpoint
ALTER POLICY "Check mode" ON "discounts" TO merchant USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
ALTER POLICY "Enable all actions for discounts in own organization" ON "discounts" TO merchant USING ("organization_id" in (select "organization_id" from "memberships"));--> statement-breakpoint
ALTER POLICY "Check mode" ON "events" TO merchant USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
ALTER POLICY "Enable insert for own organizations" ON "events" TO merchant WITH CHECK ("organization_id" in (select "organization_id" from "memberships"));--> statement-breakpoint
ALTER POLICY "Enable all actions for own organization" ON "events" TO merchant USING ("organization_id" in (select "organization_id" from "memberships"));--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "features" TO merchant USING ("organization_id" in (select "organization_id" from "memberships"));--> statement-breakpoint
ALTER POLICY "Check mode" ON "features" TO merchant USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
ALTER POLICY "Check mode" ON "fee_calculations" TO merchant USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
ALTER POLICY "Enable select for own organization" ON "fee_calculations" TO merchant USING ("organization_id" in (select "organization_id" from "memberships"));--> statement-breakpoint
ALTER POLICY "Check mode" ON "files" TO merchant USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "files" TO merchant USING ("organization_id" in (select "organization_id" from "memberships")) WITH CHECK ("product_id" is null OR "product_id" in (select "id" from "products"));--> statement-breakpoint
ALTER POLICY "Check mode" ON "invoice_line_items" TO merchant USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
ALTER POLICY "Check mode" ON "invoices" TO merchant USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "ledger_accounts" TO merchant USING ("organization_id" in (select "organization_id" from "memberships"));--> statement-breakpoint
ALTER POLICY "Check mode" ON "ledger_accounts" TO merchant USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "ledger_entries" TO merchant USING ("organization_id" in (select "organization_id" from "memberships"));--> statement-breakpoint
ALTER POLICY "Check mode" ON "ledger_entries" TO merchant USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "ledger_transactions" TO merchant USING ("organization_id" in (select "organization_id" from "memberships"));--> statement-breakpoint
ALTER POLICY "Check mode" ON "ledger_transactions" TO merchant USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "links" TO merchant USING ("organization_id" in (select "organization_id" from "memberships")) WITH CHECK ("product_id" is null OR "product_id" in (select "id" from "products"));--> statement-breakpoint
ALTER POLICY "Check mode" ON "links" TO merchant USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
ALTER POLICY "Enable read for own organizations where focused is true" ON "memberships" TO merchant USING ("user_id" = requesting_user_id() and "focused" = true and "organization_id" = current_organization_id());--> statement-breakpoint
ALTER POLICY "Check mode" ON "messages" TO merchant USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "organizations" TO merchant USING (id IN ( SELECT memberships.organization_id
   FROM memberships
  WHERE (memberships.user_id = requesting_user_id() and memberships.organization_id = current_organization_id())));--> statement-breakpoint
ALTER POLICY "Enable read for own organizations via customer" ON "payment_methods" TO merchant USING ("customer_id" in (select "id" from "customers"));--> statement-breakpoint
ALTER POLICY "Check mode" ON "payment_methods" TO merchant USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
ALTER POLICY "Enable select for own organization" ON "payments" TO merchant USING ("organization_id" in (select "organization_id" from "memberships"));--> statement-breakpoint
ALTER POLICY "Enable update for own organization" ON "payments" TO merchant USING ("organization_id" in (select "organization_id" from "memberships"));--> statement-breakpoint
ALTER POLICY "Check mode" ON "payments" TO merchant USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
ALTER POLICY "On update, ensure usage meter belongs to same organization as product" ON "prices" TO merchant WITH CHECK ("usage_meter_id" IS NULL OR "usage_meter_id" IN (
  SELECT "id" FROM "usage_meters"
  WHERE "usage_meters"."organization_id" = (
    SELECT "organization_id" FROM "products" 
    WHERE "products"."id" = "prices"."product_id"
  )
));--> statement-breakpoint
ALTER POLICY "Ensure organization integrity with products parent table" ON "prices" TO merchant USING ("product_id" in (select "id" from "products"));--> statement-breakpoint
ALTER POLICY "Check mode" ON "prices" TO merchant USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "pricing_models" TO merchant USING ("organization_id" in (select "organization_id" from "memberships"));--> statement-breakpoint
ALTER POLICY "Check mode" ON "pricing_models" TO merchant USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "product_features" TO merchant USING ("organization_id" in (select "organization_id" from "memberships"));--> statement-breakpoint
ALTER POLICY "Ensure organization integrity with products parent table" ON "product_features" TO merchant USING ("product_id" in (select "id" from "products"));--> statement-breakpoint
ALTER POLICY "Ensure organization integrity with features parent table" ON "product_features" TO merchant USING ("feature_id" in (select "id" from "features"));--> statement-breakpoint
ALTER POLICY "Check mode" ON "product_features" TO merchant USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "products" TO merchant USING ("organization_id" in (select "organization_id" from "memberships"));--> statement-breakpoint
ALTER POLICY "Check mode" ON "products" TO merchant USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "proper_nouns" TO merchant USING ("organization_id" in (select "organization_id" from "memberships" where "user_id" = requesting_user_id()));--> statement-breakpoint
ALTER POLICY "Check mode" ON "proper_nouns" TO merchant USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
ALTER POLICY "Check mode" ON "purchase_access_sessions" TO merchant USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
ALTER POLICY "Check mode" ON "purchases" TO merchant USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "refunds" TO merchant USING ("organization_id" in (select "organization_id" from "memberships"));--> statement-breakpoint
ALTER POLICY "Check mode" ON "refunds" TO merchant USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
ALTER POLICY "Ensure organization integrity with subscription_items parent table" ON "subscription_item_features" TO merchant USING ("subscription_item_id" in (select "id" from "subscription_items"));--> statement-breakpoint
ALTER POLICY "Ensure organization integrity with features parent table" ON "subscription_item_features" TO merchant USING ("feature_id" in (select "id" from "features"));--> statement-breakpoint
ALTER POLICY "Ensure organization integrity with usage_meters parent table" ON "subscription_item_features" TO merchant USING ("usage_meter_id" in (select "id" from "usage_meters"));--> statement-breakpoint
ALTER POLICY "Check mode" ON "subscription_item_features" TO merchant USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
ALTER POLICY "Enable actions for own organizations via subscriptions" ON "subscription_items" TO merchant USING ("subscription_id" in (select "id" from "subscriptions"));--> statement-breakpoint
ALTER POLICY "Check mode" ON "subscription_items" TO merchant USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "subscription_meter_period_calculations" TO merchant USING ("organization_id" in (select "organization_id" from "memberships"));--> statement-breakpoint
ALTER POLICY "Check mode" ON "subscription_meter_period_calculations" TO merchant USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
ALTER POLICY "Enable actions for own organizations via customer" ON "subscriptions" TO merchant USING ("customer_id" in (select "id" from "customers"));--> statement-breakpoint
ALTER POLICY "Forbid deletion" ON "subscriptions" TO merchant USING (false);--> statement-breakpoint
ALTER POLICY "Check mode" ON "subscriptions" TO merchant USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "usage_credit_applications" TO merchant USING ("organization_id" in (select "organization_id" from "memberships"));--> statement-breakpoint
ALTER POLICY "Check mode" ON "usage_credit_applications" TO merchant USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "usage_credit_balance_adjustments" TO merchant USING ("organization_id" in (select "organization_id" from "memberships"));--> statement-breakpoint
ALTER POLICY "Check mode" ON "usage_credit_balance_adjustments" TO merchant USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "usage_credits" TO merchant USING ("organization_id" in (select "organization_id" from "memberships"));--> statement-breakpoint
ALTER POLICY "Check mode" ON "usage_credits" TO merchant USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "usage_events" TO merchant USING ("customer_id" in (select "id" from "customers" where "organization_id" in (select "organization_id" from "memberships")));--> statement-breakpoint
ALTER POLICY "On insert, only allow usage events for prices with matching usage meter" ON "usage_events" TO merchant WITH CHECK ("price_id" in (select "id" from "prices" where "prices"."usage_meter_id" = "usage_meter_id"));--> statement-breakpoint
ALTER POLICY "On update, only allow usage events for prices with matching usage meter" ON "usage_events" TO merchant USING ("price_id" in (select "id" from "prices" where "prices"."usage_meter_id" = "usage_meter_id"));--> statement-breakpoint
ALTER POLICY "On insert, only allow usage events for subscriptions with matching customer" ON "usage_events" TO merchant WITH CHECK ("subscription_id" in (select "id" from "subscriptions" where "subscriptions"."customer_id" = "customer_id"));--> statement-breakpoint
ALTER POLICY "On update, only allow usage events for subscriptions with matching customer" ON "usage_events" TO merchant WITH CHECK ("subscription_id" in (select "id" from "subscriptions" where "subscriptions"."customer_id" = "customer_id"));--> statement-breakpoint
ALTER POLICY "On insert, only allow usage events for billing periods with matching subscription" ON "usage_events" TO merchant WITH CHECK ("billing_period_id" in (select "id" from "billing_periods" where "billing_periods"."subscription_id" = "subscription_id"));--> statement-breakpoint
ALTER POLICY "On update, only allow usage events for billing periods with matching subscription" ON "usage_events" TO merchant WITH CHECK ("billing_period_id" in (select "id" from "billing_periods" where "billing_periods"."subscription_id" = "subscription_id"));--> statement-breakpoint
ALTER POLICY "Check mode" ON "usage_events" TO merchant USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "usage_meters" TO merchant USING ("organization_id" in (select "organization_id" from "memberships"));--> statement-breakpoint
ALTER POLICY "Check mode" ON "usage_meters" TO merchant USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "webhooks" TO merchant USING ("organization_id" in (select "organization_id" from "memberships"));--> statement-breakpoint
ALTER POLICY "Check mode" ON "webhooks" TO merchant USING (current_setting('app.livemode')::boolean = livemode);