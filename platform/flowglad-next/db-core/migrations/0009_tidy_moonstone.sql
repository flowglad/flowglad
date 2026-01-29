CREATE TABLE IF NOT EXISTS "CustomerProfiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now(),
	"externalId" text,
	"CustomerId" integer NOT NULL,
	"OrganizationId" integer NOT NULL,
	"name" text,
	"invoiceNumberBase" text,
	CONSTRAINT "CustomerProfiles_externalId_unique" UNIQUE("externalId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Deals" (
	"id" serial PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now(),
	"externalId" text,
	"name" text NOT NULL,
	"CustomerProfileId" integer NOT NULL,
	"OrganizationId" integer NOT NULL,
	"PriceId" integer NOT NULL,
	"quantity" integer NOT NULL,
	"trialPeriodDays" integer DEFAULT 0 NOT NULL,
	"firstInvoiceValue" integer NOT NULL,
	"totalProjectValue" integer NOT NULL,
	"TermId" integer NOT NULL,
	CONSTRAINT "Deals_externalId_unique" UNIQUE("externalId")
);
--> statement-breakpoint
ALTER TABLE "Customers" ADD COLUMN "UserId" text;--> statement-breakpoint
ALTER TABLE "Organizations" ADD COLUMN "domain" text NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "CustomerProfiles" ADD CONSTRAINT "CustomerProfiles_CustomerId_Customers_id_fk" FOREIGN KEY ("CustomerId") REFERENCES "public"."Customers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "CustomerProfiles" ADD CONSTRAINT "CustomerProfiles_OrganizationId_Organizations_id_fk" FOREIGN KEY ("OrganizationId") REFERENCES "public"."Organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Deals" ADD CONSTRAINT "Deals_CustomerProfileId_CustomerProfiles_id_fk" FOREIGN KEY ("CustomerProfileId") REFERENCES "public"."CustomerProfiles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Deals" ADD CONSTRAINT "Deals_OrganizationId_Organizations_id_fk" FOREIGN KEY ("OrganizationId") REFERENCES "public"."Organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Deals" ADD CONSTRAINT "Deals_PriceId_Prices_id_fk" FOREIGN KEY ("PriceId") REFERENCES "public"."Prices"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Deals" ADD CONSTRAINT "Deals_TermId_Terms_id_fk" FOREIGN KEY ("TermId") REFERENCES "public"."Terms"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "CustomerProfiles_CustomerId_idx" ON "CustomerProfiles" USING btree ("CustomerId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "CustomerProfiles_OrganizationId_idx" ON "CustomerProfiles" USING btree ("OrganizationId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerProfiles_CustomerId_OrganizationId_unique_idx" ON "CustomerProfiles" USING btree ("CustomerId","OrganizationId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerProfiles_OrganizationId_invoiceNumberBase_unique_idx" ON "CustomerProfiles" USING btree ("OrganizationId","invoiceNumberBase");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Deals_CustomerProfileId_idx" ON "Deals" USING btree ("CustomerProfileId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Deals_OrganizationId_idx" ON "Deals" USING btree ("OrganizationId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Deals_PriceId_idx" ON "Deals" USING btree ("PriceId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Deals_TermId_idx" ON "Deals" USING btree ("TermId");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Customers" ADD CONSTRAINT "Customers_UserId_Users_id_fk" FOREIGN KEY ("UserId") REFERENCES "public"."Users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Customers_UserId_idx" ON "Customers" USING btree ("UserId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Organizations_domain_unique_idx" ON "Organizations" USING btree ("domain");--> statement-breakpoint
ALTER TABLE "Organizations" ADD CONSTRAINT "Organizations_domain_unique" UNIQUE("domain");