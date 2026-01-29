DO $$ BEGIN
    CREATE TYPE "PurchaseSessionStatus" AS ENUM ('open', 'succeeded', 'failed', 'expired');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "PurchaseSessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now(),
	"externalId" text NOT NULL,
	"status" "PurchaseSessionStatus" NOT NULL,
	"billingAddress" jsonb,
	"VariantId" integer NOT NULL,
	"stripePaymentIntentId" text,
	CONSTRAINT "PurchaseSessions_externalId_unique" UNIQUE("externalId")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "PurchaseSessions" ADD CONSTRAINT "PurchaseSessions_VariantId_Variants_id_fk" FOREIGN KEY ("VariantId") REFERENCES "public"."Variants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "PurchaseSessions_VariantId_idx" ON "PurchaseSessions" USING btree ("VariantId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "PurchaseSessions_stripePaymentIntentId_idx" ON "PurchaseSessions" USING btree ("stripePaymentIntentId");