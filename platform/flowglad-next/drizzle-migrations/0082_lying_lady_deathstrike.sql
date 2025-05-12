DO $$ BEGIN
    CREATE TYPE "CommunityMembershipStatus" AS ENUM ('active', 'expired', 'canceled', 'banned', 'pending', 'unclaimed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;


CREATE TABLE IF NOT EXISTS "CommunityMembershipClaims" (
	"id" serial PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now(),
	"externalId" text NOT NULL,
	"CommunityMembershipId" integer NOT NULL,
	"tokenHash" text NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"claimedAt" timestamp,
	CONSTRAINT "CommunityMembershipClaims_externalId_unique" UNIQUE("externalId")
);
--> statement-breakpoint
ALTER TABLE "CommunityMembershipClaims" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "CommunityMemberships" (
	"id" serial PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now(),
	"externalId" text NOT NULL,
	"PurchaseId" integer NOT NULL,
	"CommunityId" integer NOT NULL,
	"UserId" text,
	"status" "CommunityMembershipStatus" NOT NULL,
	"startDate" timestamp,
	"endDate" timestamp,
	"CustomerProfileId" integer,
	CONSTRAINT "CommunityMemberships_externalId_unique" UNIQUE("externalId")
);
--> statement-breakpoint
ALTER TABLE "CommunityMemberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "CommunityMembershipClaims" ADD CONSTRAINT "CommunityMembershipClaims_CommunityMembershipId_CommunityMemberships_id_fk" FOREIGN KEY ("CommunityMembershipId") REFERENCES "public"."CommunityMemberships"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "CommunityMemberships" ADD CONSTRAINT "CommunityMemberships_PurchaseId_Purchases_id_fk" FOREIGN KEY ("PurchaseId") REFERENCES "public"."Purchases"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "CommunityMemberships" ADD CONSTRAINT "CommunityMemberships_CommunityId_Communities_id_fk" FOREIGN KEY ("CommunityId") REFERENCES "public"."Communities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "CommunityMemberships" ADD CONSTRAINT "CommunityMemberships_UserId_Users_id_fk" FOREIGN KEY ("UserId") REFERENCES "public"."Users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "CommunityMemberships" ADD CONSTRAINT "CommunityMemberships_CustomerProfileId_CustomerProfiles_id_fk" FOREIGN KEY ("CustomerProfileId") REFERENCES "public"."CustomerProfiles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "CommunityMembershipClaims_CommunityMembershipId_idx" ON "CommunityMembershipClaims" USING btree ("CommunityMembershipId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "CommunityMembershipClaims_tokenHash_idx" ON "CommunityMembershipClaims" USING btree ("tokenHash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "CommunityMemberships_PurchaseId_idx" ON "CommunityMemberships" USING btree ("PurchaseId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "CommunityMemberships_CommunityId_idx" ON "CommunityMemberships" USING btree ("CommunityId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "CommunityMemberships_UserId_idx" ON "CommunityMemberships" USING btree ("UserId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "CommunityMemberships_status_idx" ON "CommunityMemberships" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "CommunityMemberships_CustomerProfileId_idx" ON "CommunityMemberships" USING btree ("CustomerProfileId");--> statement-breakpoint
CREATE POLICY "Enable read for own organizations" ON "CommunityMembershipClaims" AS PERMISSIVE FOR ALL TO "authenticated" USING ("CommunityMembershipId" in (
          select "id" 
          from "CommunityMemberships"
        ));--> statement-breakpoint
CREATE POLICY "Enable read for own communities" ON "CommunityMemberships" AS PERMISSIVE FOR ALL TO "authenticated" USING ("CommunityId" in (select "id" from "Communities") OR "UserId" = requesting_user_id() OR "CustomerProfileId" IN (select "id" from "CustomerProfiles"));