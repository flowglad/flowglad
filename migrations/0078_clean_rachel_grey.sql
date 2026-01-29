CREATE TABLE IF NOT EXISTS "Files" (
	"id" serial PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now(),
	"externalId" text NOT NULL,
	"OrganizationId" integer NOT NULL,
	"ProductId" integer,
	"fileName" text NOT NULL,
	"fileSizeKb" integer NOT NULL,
	"contentType" text NOT NULL,
	"objectKey" text NOT NULL,
	"cdnUrl" text NOT NULL,
	"etag" text NOT NULL,
	"contentHash" text NOT NULL,
	CONSTRAINT "Files_externalId_unique" UNIQUE("externalId"),
	CONSTRAINT "Files_objectKey_unique" UNIQUE("objectKey")
);
--> statement-breakpoint
ALTER TABLE "Files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Links" (
	"id" serial PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now(),
	"externalId" text NOT NULL,
	"OrganizationId" integer NOT NULL,
	"ProductId" integer,
	"name" text NOT NULL,
	"url" text NOT NULL,
	CONSTRAINT "Links_externalId_unique" UNIQUE("externalId")
);
--> statement-breakpoint
ALTER TABLE "Links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Files" ADD CONSTRAINT "Files_OrganizationId_Organizations_id_fk" FOREIGN KEY ("OrganizationId") REFERENCES "public"."Organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Files" ADD CONSTRAINT "Files_ProductId_Products_id_fk" FOREIGN KEY ("ProductId") REFERENCES "public"."Products"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Links" ADD CONSTRAINT "Links_OrganizationId_Organizations_id_fk" FOREIGN KEY ("OrganizationId") REFERENCES "public"."Organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Links" ADD CONSTRAINT "Links_ProductId_Products_id_fk" FOREIGN KEY ("ProductId") REFERENCES "public"."Products"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Files_OrganizationId_idx" ON "Files" USING btree ("OrganizationId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Files_objectKey_unique_idx" ON "Files" USING btree ("objectKey");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Links_OrganizationId_idx" ON "Links" USING btree ("OrganizationId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Links_ProductId_idx" ON "Links" USING btree ("ProductId");--> statement-breakpoint
CREATE POLICY "Enable read for own organizations" ON "Files" AS PERMISSIVE FOR ALL TO "authenticated" USING ("OrganizationId" in (select "OrganizationId" from "Memberships"));--> statement-breakpoint
CREATE POLICY "Enable read for own organizations" ON "Links" AS PERMISSIVE FOR ALL TO "authenticated" USING ("OrganizationId" in (select "OrganizationId" from "Memberships"));