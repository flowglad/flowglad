CREATE TABLE IF NOT EXISTS "DiscountRedemptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now(),
	"externalId" text NOT NULL,
	"DiscountId" integer NOT NULL,
	"PurchaseId" integer NOT NULL,
	"discountName" text NOT NULL,
	"discountCode" text NOT NULL,
	"discountAmount" integer NOT NULL,
	"discountAmountType" "DiscountAmountType" NOT NULL,
	"amount" integer NOT NULL,
	CONSTRAINT "DiscountRedemptions_externalId_unique" UNIQUE("externalId")
);
--> statement-breakpoint
ALTER TABLE "DiscountRedemptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "Purchases" ALTER COLUMN "status" SET DEFAULT 'open';--> statement-breakpoint
ALTER TABLE "Purchases" ADD COLUMN "DiscountId" integer;--> statement-breakpoint
ALTER TABLE "PurchaseSessions" ADD COLUMN "DiscountId" integer;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "DiscountRedemptions" ADD CONSTRAINT "DiscountRedemptions_DiscountId_Discounts_id_fk" FOREIGN KEY ("DiscountId") REFERENCES "public"."Discounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "DiscountRedemptions" ADD CONSTRAINT "DiscountRedemptions_PurchaseId_Purchases_id_fk" FOREIGN KEY ("PurchaseId") REFERENCES "public"."Purchases"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "DiscountRedemptions_DiscountId_idx" ON "DiscountRedemptions" USING btree ("DiscountId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "DiscountRedemptions_PurchaseId_idx" ON "DiscountRedemptions" USING btree ("PurchaseId");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Purchases" ADD CONSTRAINT "Purchases_DiscountId_Discounts_id_fk" FOREIGN KEY ("DiscountId") REFERENCES "public"."Discounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "PurchaseSessions" ADD CONSTRAINT "PurchaseSessions_DiscountId_Discounts_id_fk" FOREIGN KEY ("DiscountId") REFERENCES "public"."Discounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "PurchaseSessions_DiscountId_idx" ON "PurchaseSessions" USING btree ("DiscountId");--> statement-breakpoint
CREATE POLICY "Enable read for own organizations" ON "DiscountRedemptions" AS PERMISSIVE FOR ALL TO "authenticated" USING ("DiscountId" in (select "DiscountId" from "Discounts" where "OrganizationId" in (select "OrganizationId" from "Memberships")));

