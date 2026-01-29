DO $$ BEGIN
    CREATE TYPE "FlowgladEventType" AS ENUM ('scheduler.event.created', 'customer.created', 'customer.updated', 'purchase.completed', 'payment.failed', 'payment.succeeded', 'subscription.created', 'subscription.updated', 'subscription.canceled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    CREATE TYPE "EventCategory" AS ENUM ('financial', 'customer', 'subscription', 'integration', 'system');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    CREATE TYPE "EventRetentionPolicy" AS ENUM ('permanent', 'medium', 'short');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    CREATE TYPE "EventNoun" AS ENUM ('customer', 'user', 'purchase', 'invoice', 'payment', 'product');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "Events" (
	"id" serial PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now(),
	"externalId" text NOT NULL,
	"type" "FlowgladEventType" NOT NULL,
	"eventCategory" "EventCategory" NOT NULL,
	"eventRetentionPolicy" "EventRetentionPolicy" NOT NULL,
	"rawPayload" jsonb NOT NULL,
	"occurredAt" timestamp NOT NULL,
	"submittedAt" timestamp NOT NULL,
	"processedAt" timestamp,
	"metadata" jsonb NOT NULL,
	"source" text NOT NULL,
	"subjectEntity" "EventNoun" NOT NULL,
	"subjectId" integer NOT NULL,
	"objectEntity" "EventNoun",
	"objectId" integer,
	"OrganizationId" integer,
	CONSTRAINT "Events_externalId_unique" UNIQUE("externalId")
);
--> statement-breakpoint
ALTER TABLE "Events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Events" ADD CONSTRAINT "Events_OrganizationId_Organizations_id_fk" FOREIGN KEY ("OrganizationId") REFERENCES "public"."Organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Events_type_idx" ON "Events" USING btree ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Events_eventCategory_idx" ON "Events" USING btree ("eventCategory");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Events_eventRetentionPolicy_idx" ON "Events" USING btree ("eventRetentionPolicy");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Events_subjectEntity_idx" ON "Events" USING btree ("subjectEntity");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Events_objectEntity_idx" ON "Events" USING btree ("objectEntity");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Events_subjectEntity_subjectId_idx" ON "Events" USING btree ("subjectEntity","subjectId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Events_objectEntity_objectId_idx" ON "Events" USING btree ("objectEntity","objectId");--> statement-breakpoint
CREATE POLICY "Enable all actions for own organization" ON "Events" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("OrganizationId" in (select "OrganizationId" from "Memberships"));