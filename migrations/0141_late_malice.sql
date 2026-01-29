ALTER TABLE "PurchaseSessions" ADD COLUMN "quantity" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "PurchaseSessions" ADD COLUMN "redirectUrl" text;