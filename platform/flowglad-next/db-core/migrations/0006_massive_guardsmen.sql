CREATE TYPE "priceMode" AS ENUM ('subscription', 'payment');

CREATE TABLE IF NOT EXISTS "Memberships" (
	"id" serial PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now(),
	"externalId" text,
	"UserId" text NOT NULL,
	"OrganizationId" integer NOT NULL,
	CONSTRAINT "Memberships_externalId_unique" UNIQUE("externalId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Organizations" (
	"id" serial PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now(),
	"externalId" text,
	"name" text NOT NULL,
	"stripeAccountId" text NOT NULL,
	"CountryId" integer NOT NULL,
	CONSTRAINT "Organizations_externalId_unique" UNIQUE("externalId"),
	CONSTRAINT "Organizations_name_unique" UNIQUE("name"),
	CONSTRAINT "Organizations_stripeAccountId_unique" UNIQUE("stripeAccountId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Products" (
	"id" serial PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now(),
	"externalId" text,
	"price" integer NOT NULL,
	"name" text NOT NULL,
	"priceMode" "priceMode",
	"stripeProductId" text,
	"defaultStripePriceId" text,
	"isActive" boolean,
	"OrganizationId" integer NOT NULL,
	CONSTRAINT "Products_externalId_unique" UNIQUE("externalId"),
	CONSTRAINT "Products_stripeProductId_unique" UNIQUE("stripeProductId"),
	CONSTRAINT "Products_defaultStripePriceId_unique" UNIQUE("defaultStripePriceId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Terms" (
	"id" serial PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now(),
	"externalId" text,
	"name" text NOT NULL,
	"text" text NOT NULL,
	"OrganizationId" integer NOT NULL,
	CONSTRAINT "Terms_externalId_unique" UNIQUE("externalId")
);
--> statement-breakpoint
ALTER TABLE "Users" DROP CONSTRAINT IF EXISTS "Countries_externalId_unique";--> statement-breakpoint
ALTER TABLE "Countries" ALTER COLUMN "name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "Countries" ALTER COLUMN "code" SET NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Memberships" ADD CONSTRAINT "Memberships_UserId_Users_id_fk" FOREIGN KEY ("UserId") REFERENCES "public"."Users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Memberships" ADD CONSTRAINT "Memberships_OrganizationId_Organizations_id_fk" FOREIGN KEY ("OrganizationId") REFERENCES "public"."Organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Organizations" ADD CONSTRAINT "Organizations_CountryId_Countries_id_fk" FOREIGN KEY ("CountryId") REFERENCES "public"."Countries"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Products" ADD CONSTRAINT "Products_OrganizationId_Organizations_id_fk" FOREIGN KEY ("OrganizationId") REFERENCES "public"."Organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Terms" ADD CONSTRAINT "Terms_OrganizationId_Organizations_id_fk" FOREIGN KEY ("OrganizationId") REFERENCES "public"."Organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Memberships_UserId_idx" ON "Memberships" USING btree ("UserId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Memberships_OrganizationId_idx" ON "Memberships" USING btree ("OrganizationId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Memberships_UserId_OrganizationId_unique_idx" ON "Memberships" USING btree ("UserId","OrganizationId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Organizations_name_unique_idx" ON "Organizations" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Organizations_stripeAccountId_unique_idx" ON "Organizations" USING btree ("stripeAccountId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Organizations_CountryId_idx" ON "Organizations" USING btree ("CountryId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Products_OrganizationId_idx" ON "Products" USING btree ("OrganizationId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Products_isActive_idx" ON "Products" USING btree ("isActive");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Products_stripeProductId_idx" ON "Products" USING btree ("stripeProductId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Products_priceMode_idx" ON "Products" USING btree ("priceMode");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Terms_OrganizationId_idx" ON "Terms" USING btree ("OrganizationId");--> statement-breakpoint
ALTER TABLE "Countries" ADD CONSTRAINT "Countries_name_unique" UNIQUE("name");--> statement-breakpoint
ALTER TABLE "Countries" ADD CONSTRAINT "Countries_code_unique" UNIQUE("code");--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Users_externalId_unique') THEN
        ALTER TABLE "Users" ADD CONSTRAINT "Users_externalId_unique" UNIQUE("externalId");
    END IF;
END $$;