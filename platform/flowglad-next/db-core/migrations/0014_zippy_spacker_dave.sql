DO $$ BEGIN
    CREATE TYPE "TestimonialStatus" AS ENUM ('needs_request', 'requested', 'received', 'published', 'unpublished');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;


CREATE TABLE IF NOT EXISTS "Testimonials" (
	"id" serial PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now(),
	"externalId" text,
	"public" boolean NOT NULL,
	"status" "TestimonialStatus" NOT NULL,
	"ProjectId" integer NOT NULL,
	"source" text,
	"type" text,
	"thumbnailURL" text,
	"CustomerProfileId" integer NOT NULL,
	"customerName" text,
	"customerProfilePicURL" text,
	"customerEmail" text,
	"customerTagline" text,
	"customerCompany" text,
	"customerCompanyLogo" text,
	"customerPosition" text,
	"customerTeam" text,
	"customerURL" text,
	"formId" text NOT NULL,
	"starRating" integer,
	"testimonialText" text,
	"videoURL" text,
	"title" text,
	CONSTRAINT "Testimonials_externalId_unique" UNIQUE("externalId"),
	CONSTRAINT "Testimonials_formId_unique" UNIQUE("formId")
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "billingInterval" interval;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "billingIntervalCount" integer;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "billingAnchorDate" timestamp;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Testimonials" ADD CONSTRAINT "Testimonials_ProjectId_Projects_id_fk" FOREIGN KEY ("ProjectId") REFERENCES "public"."Projects"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Testimonials" ADD CONSTRAINT "Testimonials_CustomerProfileId_CustomerProfiles_id_fk" FOREIGN KEY ("CustomerProfileId") REFERENCES "public"."CustomerProfiles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Testimonials_formId_unique_idx" ON "Testimonials" USING btree ("formId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Testimonials_ProjectId_idx" ON "Testimonials" USING btree ("ProjectId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Testimonials_CustomerProfileId_idx" ON "Testimonials" USING btree ("CustomerProfileId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Testimonials_status_idx" ON "Testimonials" USING btree ("status");