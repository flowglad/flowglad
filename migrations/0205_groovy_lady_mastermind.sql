ALTER TABLE "api_keys" ADD COLUMN "position" bigserial NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_period_items" ADD COLUMN "position" bigserial NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_periods" ADD COLUMN "position" bigserial NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_runs" ADD COLUMN "position" bigserial NOT NULL;--> statement-breakpoint
ALTER TABLE "catalogs" ADD COLUMN "position" bigserial NOT NULL;--> statement-breakpoint
ALTER TABLE "checkout_sessions" ADD COLUMN "position" bigserial NOT NULL;--> statement-breakpoint
ALTER TABLE "countries" ADD COLUMN "position" bigserial NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "position" bigserial NOT NULL;--> statement-breakpoint
ALTER TABLE "discount_redemptions" ADD COLUMN "position" bigserial NOT NULL;--> statement-breakpoint
ALTER TABLE "discounts" ADD COLUMN "position" bigserial NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "position" bigserial NOT NULL;--> statement-breakpoint
ALTER TABLE "fee_calculations" ADD COLUMN "position" bigserial NOT NULL;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "position" bigserial NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD COLUMN "position" bigserial NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "position" bigserial NOT NULL;--> statement-breakpoint
ALTER TABLE "links" ADD COLUMN "position" bigserial NOT NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "position" bigserial NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "position" bigserial NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "position" bigserial NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD COLUMN "position" bigserial NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "position" bigserial NOT NULL;--> statement-breakpoint
ALTER TABLE "prices" ADD COLUMN "position" bigserial NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "position" bigserial NOT NULL;--> statement-breakpoint
ALTER TABLE "proper_nouns" ADD COLUMN "position" bigserial NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_access_sessions" ADD COLUMN "position" bigserial NOT NULL;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "position" bigserial NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_items" ADD COLUMN "position" bigserial NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "position" bigserial NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "position" bigserial NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_meters" ADD COLUMN "position" bigserial NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "position" bigserial NOT NULL;

-- Update positions based on created_at
UPDATE "api_keys" SET "position" = sub.row_num
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as row_num FROM "api_keys") as sub
WHERE "api_keys".id = sub.id;

UPDATE "billing_period_items" SET "position" = sub.row_num
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as row_num FROM "billing_period_items") as sub
WHERE "billing_period_items".id = sub.id;

UPDATE "billing_periods" SET "position" = sub.row_num
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as row_num FROM "billing_periods") as sub
WHERE "billing_periods".id = sub.id;

UPDATE "billing_runs" SET "position" = sub.row_num
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as row_num FROM "billing_runs") as sub
WHERE "billing_runs".id = sub.id;

UPDATE "catalogs" SET "position" = sub.row_num
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as row_num FROM "catalogs") as sub
WHERE "catalogs".id = sub.id;

UPDATE "checkout_sessions" SET "position" = sub.row_num
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as row_num FROM "checkout_sessions") as sub
WHERE "checkout_sessions".id = sub.id;

UPDATE "countries" SET "position" = sub.row_num
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as row_num FROM "countries") as sub
WHERE "countries".id = sub.id;

UPDATE "customers" SET "position" = sub.row_num
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as row_num FROM "customers") as sub
WHERE "customers".id = sub.id;

UPDATE "discount_redemptions" SET "position" = sub.row_num
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as row_num FROM "discount_redemptions") as sub
WHERE "discount_redemptions".id = sub.id;

UPDATE "discounts" SET "position" = sub.row_num
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as row_num FROM "discounts") as sub
WHERE "discounts".id = sub.id;

UPDATE "events" SET "position" = sub.row_num
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as row_num FROM "events") as sub
WHERE "events".id = sub.id;

UPDATE "fee_calculations" SET "position" = sub.row_num
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as row_num FROM "fee_calculations") as sub
WHERE "fee_calculations".id = sub.id;

UPDATE "files" SET "position" = sub.row_num
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as row_num FROM "files") as sub
WHERE "files".id = sub.id;

UPDATE "invoice_line_items" SET "position" = sub.row_num
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as row_num FROM "invoice_line_items") as sub
WHERE "invoice_line_items".id = sub.id;

UPDATE "invoices" SET "position" = sub.row_num
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as row_num FROM "invoices") as sub
WHERE "invoices".id = sub.id;

UPDATE "links" SET "position" = sub.row_num
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as row_num FROM "links") as sub
WHERE "links".id = sub.id;

UPDATE "memberships" SET "position" = sub.row_num
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as row_num FROM "memberships") as sub
WHERE "memberships".id = sub.id;

UPDATE "messages" SET "position" = sub.row_num
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as row_num FROM "messages") as sub
WHERE "messages".id = sub.id;

UPDATE "organizations" SET "position" = sub.row_num
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as row_num FROM "organizations") as sub
WHERE "organizations".id = sub.id;

UPDATE "payment_methods" SET "position" = sub.row_num
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as row_num FROM "payment_methods") as sub
WHERE "payment_methods".id = sub.id;

UPDATE "payments" SET "position" = sub.row_num
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as row_num FROM "payments") as sub
WHERE "payments".id = sub.id;

UPDATE "prices" SET "position" = sub.row_num
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as row_num FROM "prices") as sub
WHERE "prices".id = sub.id;

UPDATE "products" SET "position" = sub.row_num
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as row_num FROM "products") as sub
WHERE "products".id = sub.id;

UPDATE "proper_nouns" SET "position" = sub.row_num
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as row_num FROM "proper_nouns") as sub
WHERE "proper_nouns".id = sub.id;

UPDATE "purchase_access_sessions" SET "position" = sub.row_num
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as row_num FROM "purchase_access_sessions") as sub
WHERE "purchase_access_sessions".id = sub.id;

UPDATE "purchases" SET "position" = sub.row_num
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as row_num FROM "purchases") as sub
WHERE "purchases".id = sub.id;

UPDATE "subscription_items" SET "position" = sub.row_num
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as row_num FROM "subscription_items") as sub
WHERE "subscription_items".id = sub.id;

UPDATE "subscriptions" SET "position" = sub.row_num
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as row_num FROM "subscriptions") as sub
WHERE "subscriptions".id = sub.id;

UPDATE "usage_events" SET "position" = sub.row_num
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as row_num FROM "usage_events") as sub
WHERE "usage_events".id = sub.id;

UPDATE "usage_meters" SET "position" = sub.row_num
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as row_num FROM "usage_meters") as sub
WHERE "usage_meters".id = sub.id;

UPDATE "users" SET "position" = sub.row_num
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as row_num FROM "users") as sub
WHERE "users".id = sub.id;