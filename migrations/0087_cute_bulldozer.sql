DO $$ BEGIN
    CREATE TYPE "DiscountAmountType" AS ENUM ('percent', 'fixed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    CREATE TYPE "DiscountDuration" AS ENUM ('once', 'forever', 'number_of_payments');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    CREATE TYPE "StepType" AS ENUM ('FIND_OR_CREATE_CUSTOMER', 'CONDITION', 'FIND_OR_CREATE_CUSTOMER_PROFILE', 'SUBSCRIBE_CUSTOMER_PROFILE_TO_NEWSLETTER');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "Discounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now(),
	"externalId" text NOT NULL,
	"OrganizationId" integer NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"amount" integer NOT NULL,
	"amountType" "DiscountAmountType" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"duration" "DiscountDuration" NOT NULL,
	"numberOfPayments" integer,
	CONSTRAINT "Discounts_externalId_unique" UNIQUE("externalId")
);
--> statement-breakpoint
ALTER TABLE "Discounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "FlowSteps" (
	"id" serial PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now(),
	"externalId" text NOT NULL,
	"FlowId" integer NOT NULL,
	"stepType" "StepType" NOT NULL,
	"inputMapping" jsonb NOT NULL,
	CONSTRAINT "FlowSteps_externalId_unique" UNIQUE("externalId")
);
--> statement-breakpoint
ALTER TABLE "FlowSteps" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Discounts" ADD CONSTRAINT "Discounts_OrganizationId_Organizations_id_fk" FOREIGN KEY ("OrganizationId") REFERENCES "public"."Organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "FlowSteps" ADD CONSTRAINT "FlowSteps_FlowId_Flows_id_fk" FOREIGN KEY ("FlowId") REFERENCES "public"."Flows"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Discounts_OrganizationId_idx" ON "Discounts" USING btree ("OrganizationId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Discounts_code_idx" ON "Discounts" USING btree ("code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "FlowSteps_FlowId_idx" ON "FlowSteps" USING btree ("FlowId");--> statement-breakpoint
CREATE POLICY "Enable all actions for discounts in own organization" ON "Discounts" AS PERMISSIVE FOR ALL TO "authenticated" USING ("OrganizationId" in (select "OrganizationId" from "Memberships"));--> statement-breakpoint
CREATE POLICY "Enable all actions for flows in own organization" ON "FlowSteps" AS PERMISSIVE FOR ALL TO "authenticated" USING ("FlowId" in (select "id" from "Flows" where "OrganizationId" in (select "OrganizationId" from "Memberships")));