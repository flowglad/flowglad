ALTER TABLE "Invoices" ADD COLUMN "ownerMembershipId" text;--> statement-breakpoint
ALTER TABLE "Organizations" ADD COLUMN "billingAddress" jsonb;--> statement-breakpoint
ALTER TABLE "Organizations" ADD COLUMN "contactEmail" text;--> statement-breakpoint
ALTER TABLE "PaymentMethods" ADD COLUMN "default" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Invoices" ADD CONSTRAINT "Invoices_ownerMembershipId_Memberships_id_fk" FOREIGN KEY ("ownerMembershipId") REFERENCES "public"."Memberships"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
