DO $$ BEGIN
  CREATE TYPE "FormFieldType" AS ENUM (
    'short_answer',
    'paragraph_answer',
    'multiple_choice',
    'checkboxes',
    'dropdown',
    'file_upload',
    'date',
    'time'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "FormFields" (
	"id" serial PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now(),
	"externalId" text NOT NULL,
	"order" integer NOT NULL,
	"FormId" integer NOT NULL,
	"type" "FormFieldType",
	"question" text NOT NULL,
	"description" text,
	"required" boolean DEFAULT false NOT NULL,
	"fieldParameters" jsonb,
	CONSTRAINT "FormFields_externalId_unique" UNIQUE("externalId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Forms" (
	"id" serial PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now(),
	"externalId" text NOT NULL,
	"title" text NOT NULL,
	"OrganizationId" integer NOT NULL,
	CONSTRAINT "Forms_externalId_unique" UNIQUE("externalId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "FormSubmissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now(),
	"externalId" text NOT NULL,
	"FormId" integer NOT NULL,
	"UserId" text NOT NULL,
	"response" jsonb NOT NULL,
	CONSTRAINT "FormSubmissions_externalId_unique" UNIQUE("externalId")
);
--> statement-breakpoint
ALTER TABLE "Testimonials" ADD COLUMN "OrganizationId" integer NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "FormFields" ADD CONSTRAINT "FormFields_FormId_Forms_id_fk" FOREIGN KEY ("FormId") REFERENCES "public"."Forms"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Forms" ADD CONSTRAINT "Forms_OrganizationId_Organizations_id_fk" FOREIGN KEY ("OrganizationId") REFERENCES "public"."Organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "FormSubmissions" ADD CONSTRAINT "FormSubmissions_FormId_Forms_id_fk" FOREIGN KEY ("FormId") REFERENCES "public"."Forms"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "FormSubmissions" ADD CONSTRAINT "FormSubmissions_UserId_Users_id_fk" FOREIGN KEY ("UserId") REFERENCES "public"."Users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "FormFields_FormId_idx" ON "FormFields" USING btree ("FormId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "FormFields_type_idx" ON "FormFields" USING btree ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Forms_OrganizationId_idx" ON "Forms" USING btree ("OrganizationId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "FormSubmissions_FormId_idx" ON "FormSubmissions" USING btree ("FormId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "FormSubmissions_UserId_idx" ON "FormSubmissions" USING btree ("UserId");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Testimonials" ADD CONSTRAINT "Testimonials_OrganizationId_Organizations_id_fk" FOREIGN KEY ("OrganizationId") REFERENCES "public"."Organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
