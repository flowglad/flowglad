ALTER TABLE "Countries" ALTER COLUMN "externalId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "CustomerProfiles" ALTER COLUMN "externalId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "Customers" ALTER COLUMN "externalId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "InvoiceLineItems" ALTER COLUMN "externalId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "externalId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "Memberships" ALTER COLUMN "externalId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "Organizations" ALTER COLUMN "externalId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "Products" ALTER COLUMN "externalId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "Projects" ALTER COLUMN "externalId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "Terms" ALTER COLUMN "externalId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "Testimonials" ALTER COLUMN "externalId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "Users" ALTER COLUMN "externalId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "Variants" ALTER COLUMN "externalId" SET NOT NULL;