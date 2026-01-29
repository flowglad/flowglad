DO $$ BEGIN
    CREATE TYPE "PurchaseAccessSessionSource" AS ENUM ('email_verification', 'purchase_session');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint


CREATE TABLE IF NOT EXISTS "PurchaseAccessSessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now(),
	"externalId" text NOT NULL,
	"PurchaseId" integer NOT NULL,
	"token" text NOT NULL,
	"source" "PurchaseAccessSessionSource" NOT NULL,
	"expires" timestamp NOT NULL,
	"granted" boolean DEFAULT false,
	"metadata" jsonb,
	CONSTRAINT "PurchaseAccessSessions_externalId_unique" UNIQUE("externalId")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "PurchaseAccessSessions" ADD CONSTRAINT "PurchaseAccessSessions_PurchaseId_Purchases_id_fk" FOREIGN KEY ("PurchaseId") REFERENCES "public"."Purchases"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "PurchaseAccessSessions_PurchaseId_idx" ON "PurchaseAccessSessions" USING btree ("PurchaseId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseAccessSessions_token_unique_idx" ON "PurchaseAccessSessions" USING btree ("token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Payments_InvoiceId_idx" ON "Payments" USING btree ("InvoiceId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Payments_OrganizationId_idx" ON "Payments" USING btree ("OrganizationId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Payments_paymentMethod_idx" ON "Payments" USING btree ("paymentMethod");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Payments_status_idx" ON "Payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Payments_currency_idx" ON "Payments" USING btree ("currency");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Payments_PurchaseId_idx" ON "Payments" USING btree ("PurchaseId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Payments_stripePaymentIntentId_unique_idx" ON "Payments" USING btree ("stripePaymentIntentId");