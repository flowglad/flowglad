CREATE TABLE IF NOT EXISTS "Flows" (
	"id" serial PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now(),
	"externalId" text NOT NULL,
	"OrganizationId" integer NOT NULL,
	"title" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "Flows_externalId_unique" UNIQUE("externalId")
);
--> statement-breakpoint
ALTER TABLE "Variants" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Flows" ADD CONSTRAINT "Flows_OrganizationId_Organizations_id_fk" FOREIGN KEY ("OrganizationId") REFERENCES "public"."Organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Flows_OrganizationId_idx" ON "Flows" USING btree ("OrganizationId");