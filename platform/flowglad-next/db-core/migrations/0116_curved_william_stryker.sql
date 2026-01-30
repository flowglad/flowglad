
ALTER TABLE "Communities" ADD COLUMN "test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "CommunityMembershipClaims" ADD COLUMN "test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "CommunityMemberships" ADD COLUMN "test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "Countries" ADD COLUMN "test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "CustomerProfiles" ADD COLUMN "test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "Customers" ADD COLUMN "test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "DiscountRedemptions" ADD COLUMN "test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "Discounts" ADD COLUMN "test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "Events" ADD COLUMN "test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "FeeCalculations" ADD COLUMN "test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "Files" ADD COLUMN "test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "Flows" ADD COLUMN "test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "FormFields" ADD COLUMN "test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "Forms" ADD COLUMN "test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "FormSubmissions" ADD COLUMN "test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "Integrations" ADD COLUMN "test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "IntegrationSessions" ADD COLUMN "test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "InvoiceLineItems" ADD COLUMN "test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "Invoices" ADD COLUMN "test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "Links" ADD COLUMN "test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "Memberships" ADD COLUMN "test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "Messages" ADD COLUMN "test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "Offerings" ADD COLUMN "test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "Organizations" ADD COLUMN "test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "Payments" ADD COLUMN "test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "Products" ADD COLUMN "test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ProperNouns" ADD COLUMN "test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "PurchaseAccessSessions" ADD COLUMN "test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "Purchases" ADD COLUMN "test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "PurchaseSessions" ADD COLUMN "test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "Testimonials" ADD COLUMN "test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "Users" ADD COLUMN "test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "Variants" ADD COLUMN "test" boolean DEFAULT false NOT NULL;

ALTER TABLE "ApiKeys" RENAME COLUMN "test" TO "livemode";--> statement-breakpoint
ALTER TABLE "Communities" RENAME COLUMN "test" TO "livemode";--> statement-breakpoint
ALTER TABLE "CommunityMembershipClaims" RENAME COLUMN "test" TO "livemode";--> statement-breakpoint
ALTER TABLE "CommunityMemberships" RENAME COLUMN "test" TO "livemode";--> statement-breakpoint
ALTER TABLE "CustomerProfiles" RENAME COLUMN "test" TO "livemode";--> statement-breakpoint
ALTER TABLE "Customers" RENAME COLUMN "test" TO "livemode";--> statement-breakpoint
ALTER TABLE "DiscountRedemptions" RENAME COLUMN "test" TO "livemode";--> statement-breakpoint
ALTER TABLE "Discounts" RENAME COLUMN "test" TO "livemode";--> statement-breakpoint
ALTER TABLE "Events" RENAME COLUMN "test" TO "livemode";--> statement-breakpoint
ALTER TABLE "FeeCalculations" RENAME COLUMN "test" TO "livemode";--> statement-breakpoint
ALTER TABLE "Files" RENAME COLUMN "test" TO "livemode";--> statement-breakpoint
ALTER TABLE "Flows" RENAME COLUMN "test" TO "livemode";--> statement-breakpoint
ALTER TABLE "FormFields" RENAME COLUMN "test" TO "livemode";--> statement-breakpoint
ALTER TABLE "Forms" RENAME COLUMN "test" TO "livemode";--> statement-breakpoint
ALTER TABLE "FormSubmissions" RENAME COLUMN "test" TO "livemode";--> statement-breakpoint
ALTER TABLE "Integrations" RENAME COLUMN "test" TO "livemode";--> statement-breakpoint
ALTER TABLE "IntegrationSessions" RENAME COLUMN "test" TO "livemode";--> statement-breakpoint
ALTER TABLE "InvoiceLineItems" RENAME COLUMN "test" TO "livemode";--> statement-breakpoint
ALTER TABLE "Invoices" RENAME COLUMN "test" TO "livemode";--> statement-breakpoint
ALTER TABLE "Links" RENAME COLUMN "test" TO "livemode";--> statement-breakpoint
ALTER TABLE "Memberships" RENAME COLUMN "test" TO "livemode";--> statement-breakpoint
ALTER TABLE "Messages" RENAME COLUMN "test" TO "livemode";--> statement-breakpoint
ALTER TABLE "Offerings" RENAME COLUMN "test" TO "livemode";--> statement-breakpoint
ALTER TABLE "Organizations" RENAME COLUMN "test" TO "livemode";--> statement-breakpoint
ALTER TABLE "Payments" RENAME COLUMN "test" TO "livemode";--> statement-breakpoint
ALTER TABLE "Products" RENAME COLUMN "test" TO "livemode";--> statement-breakpoint
ALTER TABLE "ProperNouns" RENAME COLUMN "test" TO "livemode";--> statement-breakpoint
ALTER TABLE "PurchaseAccessSessions" RENAME COLUMN "test" TO "livemode";--> statement-breakpoint
ALTER TABLE "Purchases" RENAME COLUMN "test" TO "livemode";--> statement-breakpoint
ALTER TABLE "PurchaseSessions" RENAME COLUMN "test" TO "livemode";--> statement-breakpoint
ALTER TABLE "Variants" RENAME COLUMN "test" TO "livemode";--> statement-breakpoint
ALTER TABLE "Testimonials" ADD COLUMN "livemode" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "Countries" DROP COLUMN IF EXISTS "test";--> statement-breakpoint
ALTER TABLE "Testimonials" DROP COLUMN IF EXISTS "test";--> statement-breakpoint
ALTER TABLE "Users" DROP COLUMN IF EXISTS "test";