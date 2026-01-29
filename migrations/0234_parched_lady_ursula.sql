GRANT merchant TO current_user;
ALTER TABLE "countries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "billing_period_items" RENAME TO "Enable read for own organizations (billing_period_items)";--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "billing_periods" RENAME TO "Enable read for own organizations (billing_periods)";--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "billing_runs" RENAME TO "Enable read for own organizations (billing_runs)";--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "discount_redemptions" RENAME TO "Enable read for own organizations (discount_redemptions)";--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "features" RENAME TO "Enable read for own organizations (features)";--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "files" RENAME TO "Enable read for own organizations (files)";--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "ledger_accounts" RENAME TO "Enable read for own organizations (ledger_accounts)";--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "ledger_entries" RENAME TO "Enable read for own organizations (ledger_entries)";--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "ledger_transactions" RENAME TO "Enable read for own organizations (ledger_transactions)";--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "links" RENAME TO "Enable read for own organizations (links)";--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "organizations" RENAME TO "Enable read for own organizations (organizations)";--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "pricing_models" RENAME TO "Enable read for own organizations (pricing_models)";--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "products" RENAME TO "Enable read for own organizations (products)";--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "proper_nouns" RENAME TO "Enable read for own organizations (proper_nouns)";--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "refunds" RENAME TO "Enable read for own organizations (refunds)";--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "subscription_meter_period_calculations" RENAME TO "Enable read for own organizations (subscription_meter_period_calculations)";--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "usage_credit_applications" RENAME TO "Enable read for own organizations (usage_credit_applications)";--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "usage_credit_balance_adjustments" RENAME TO "Enable read for own organizations (usage_credit_balance_adjustments)";--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "usage_credits" RENAME TO "Enable read for own organizations (usage_credits)";--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "usage_events" RENAME TO "Enable read for own organizations (usage_events)";--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "usage_meters" RENAME TO "Enable read for own organizations (usage_meters)";--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "webhooks" RENAME TO "Enable read for own organizations (webhooks)";--> statement-breakpoint
CREATE POLICY "Enable read" ON "countries" AS PERMISSIVE FOR SELECT TO "merchant" USING (true);--> statement-breakpoint
CREATE POLICY "Enable read for own organizations (invoices)" ON "invoices" AS PERMISSIVE FOR ALL TO "merchant" USING ("organization_id" in (select "organization_id" from "memberships"));--> statement-breakpoint
CREATE POLICY "Enable read for own organizations (product_features)" ON "product_features" AS PERMISSIVE FOR ALL TO "merchant" USING ("organization_id" in (select "organization_id" from "memberships"));--> statement-breakpoint
CREATE POLICY "Enable read for own organizations (purchases)" ON "purchases" AS PERMISSIVE FOR SELECT TO "merchant" USING ("organization_id" in (select "organization_id" from "memberships"));--> statement-breakpoint
CREATE POLICY "Enable read for own organizations (subscription_item_features)" ON "subscription_item_features" AS PERMISSIVE FOR SELECT TO "merchant" USING ("subscription_item_id" in (select "id" from "subscription_items"));
