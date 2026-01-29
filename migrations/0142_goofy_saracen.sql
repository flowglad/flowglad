ALTER TABLE "PurchaseSessions" RENAME COLUMN "redirectUrl" TO "successUrl";--> statement-breakpoint
ALTER TABLE "PurchaseSessions" ADD COLUMN "cancelUrl" text;