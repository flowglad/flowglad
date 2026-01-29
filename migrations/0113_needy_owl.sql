DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OfferingType') THEN
    CREATE TYPE "OfferingType" AS ENUM ('file', 'link', 'community');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "Offerings" (
	"id" text PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now(),
	"OrganizationId" text NOT NULL,
	"VariantId" text,
	"ProductId" text NOT NULL,
	"type" "OfferingType" NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"OfferableId" text NOT NULL,
	CONSTRAINT "Offerings_id_unique" UNIQUE("id")
);
--> statement-breakpoint
ALTER TABLE "Offerings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Offerings" ADD CONSTRAINT "Offerings_OrganizationId_Organizations_id_fk" FOREIGN KEY ("OrganizationId") REFERENCES "public"."Organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Offerings" ADD CONSTRAINT "Offerings_VariantId_Variants_id_fk" FOREIGN KEY ("VariantId") REFERENCES "public"."Variants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Offerings" ADD CONSTRAINT "Offerings_ProductId_Products_id_fk" FOREIGN KEY ("ProductId") REFERENCES "public"."Products"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Offerings_OrganizationId_idx" ON "Offerings" USING btree ("OrganizationId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Offerings_VariantId_idx" ON "Offerings" USING btree ("VariantId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Offerings_ProductId_idx" ON "Offerings" USING btree ("ProductId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Offerings_type_OfferableId_idx" ON "Offerings" USING btree ("type","OfferableId");--> statement-breakpoint
CREATE POLICY "Enable read for own organizations" ON "Offerings" AS PERMISSIVE FOR ALL TO "authenticated" USING ("OrganizationId" in (select "OrganizationId" from "Memberships"));