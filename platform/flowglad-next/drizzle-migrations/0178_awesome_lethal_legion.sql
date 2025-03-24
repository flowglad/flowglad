ALTER TABLE "api_keys" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "api_keys" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "billing_period_items" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "billing_period_items" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "billing_periods" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "billing_periods" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "billing_runs" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "billing_runs" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "catalogs" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "catalogs" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "checkout_sessions" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "checkout_sessions" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "countries" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "countries" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "customers" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "customers" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "discount_redemptions" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "discount_redemptions" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "discounts" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "discounts" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "events" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "events" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "fee_calculations" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "fee_calculations" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "files" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "files" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "invoice_line_items" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "invoice_line_items" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "invoices" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "invoices" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "links" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "links" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "memberships" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "memberships" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "messages" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "messages" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "organizations" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "organizations" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "payment_methods" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "payment_methods" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "payments" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "payments" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "prices" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "prices" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "products" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "products" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "proper_nouns" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "proper_nouns" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "purchase_access_sessions" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "purchase_access_sessions" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "purchases" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "purchases" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "subscription_items" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "subscription_items" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "subscriptions" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "subscriptions" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "updatedAt" TO "updated_at";

SELECT c.id, c.organization_id, c.livemode, c.catalog_id, cat.id as default_catalog_id, cat.livemode as catalog_livemode
FROM customers c
LEFT JOIN catalogs cat ON cat.organization_id = c.organization_id 
    AND cat.is_default = true 
    AND cat.livemode = c.livemode
WHERE c.catalog_id IS NULL;