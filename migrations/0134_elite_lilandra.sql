DROP POLICY "Check mode" ON "Communities" CASCADE;--> statement-breakpoint
DROP POLICY "Enable read for own organizations" ON "Communities" CASCADE;--> statement-breakpoint
DROP TABLE "Communities" CASCADE;--> statement-breakpoint
DROP POLICY "Enable read for own organizations" ON "CommunityMembershipClaims" CASCADE;--> statement-breakpoint
DROP POLICY "Check mode" ON "CommunityMembershipClaims" CASCADE;--> statement-breakpoint
DROP TABLE "CommunityMembershipClaims" CASCADE;--> statement-breakpoint
DROP POLICY IF EXISTS "Enable read for own communities" ON "CommunityMemberships" CASCADE;--> statement-breakpoint
DROP POLICY "Check mode" ON "CommunityMemberships" CASCADE;--> statement-breakpoint
DROP TABLE "CommunityMemberships" CASCADE;--> statement-breakpoint
DROP POLICY "Enable all actions for own organization" ON "Flows" CASCADE;--> statement-breakpoint
DROP POLICY "Check mode" ON "Flows" CASCADE;--> statement-breakpoint
DROP TABLE "Flows" CASCADE;--> statement-breakpoint
DROP POLICY "Check mode" ON "Testimonials" CASCADE;--> statement-breakpoint
DROP TABLE "Testimonials" CASCADE;--> statement-breakpoint
DROP INDEX IF EXISTS "Customers_email_unique_idx";--> statement-breakpoint
ALTER TABLE "ApiKeys" ALTER COLUMN "livemode" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "BillingPeriodItems" ALTER COLUMN "livemode" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "BillingPeriods" ALTER COLUMN "livemode" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "BillingRuns" ALTER COLUMN "livemode" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "CustomerProfiles" ALTER COLUMN "livemode" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "Customers" ALTER COLUMN "livemode" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "DiscountRedemptions" ALTER COLUMN "livemode" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "Discounts" ALTER COLUMN "livemode" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "Events" ALTER COLUMN "livemode" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "FeeCalculations" ALTER COLUMN "livemode" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "Files" ALTER COLUMN "livemode" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "FormFields" ALTER COLUMN "livemode" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "Forms" ALTER COLUMN "livemode" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "FormSubmissions" ALTER COLUMN "livemode" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "Integrations" ALTER COLUMN "livemode" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "IntegrationSessions" ALTER COLUMN "livemode" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "InvoiceLineItems" ALTER COLUMN "livemode" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "Invoices" ALTER COLUMN "livemode" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "Links" ALTER COLUMN "livemode" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "Memberships" ALTER COLUMN "livemode" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "Messages" ALTER COLUMN "livemode" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "Offerings" ALTER COLUMN "livemode" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "PaymentMethods" ALTER COLUMN "livemode" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "Payments" ALTER COLUMN "livemode" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "Products" ALTER COLUMN "livemode" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "ProperNouns" ALTER COLUMN "livemode" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "PurchaseAccessSessions" ALTER COLUMN "livemode" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "Purchases" ALTER COLUMN "livemode" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "PurchaseSessions" ALTER COLUMN "livemode" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "SubscriptionItems" ALTER COLUMN "livemode" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "Subscriptions" ALTER COLUMN "livemode" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "Variants" ALTER COLUMN "livemode" DROP DEFAULT;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Customers_email_livemode_unique_idx" ON "Customers" USING btree ("email","livemode");