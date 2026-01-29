ALTER TABLE "Flows" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "FormFields" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "Forms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "FormSubmissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "Integrations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "IntegrationSessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "InvoiceLineItems" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "Invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "Memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "Messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "Organizations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "Payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "Products" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "PurchaseAccessSessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "Purchases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "PurchaseSessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "Testimonials" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "Users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "Variants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "Terms" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "Terms" CASCADE;--> statement-breakpoint
ALTER TABLE "Purchases" DROP CONSTRAINT IF EXISTS "Purchases_TermId_Terms_id_fk";
--> statement-breakpoint
ALTER TABLE "Purchases" DROP COLUMN IF EXISTS "TermId";