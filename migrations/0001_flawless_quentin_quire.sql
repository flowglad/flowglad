CREATE TABLE IF NOT EXISTS "Countries" (
	"id" serial PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now(),
	"externalId" text,
	"name" text NOT NULL,
	"code" text NOT NULL,
	CONSTRAINT "Countries_externalId_unique" UNIQUE("externalId")
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Countries_name_idx" ON "Countries" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Countries_code_idx" ON "Countries" USING btree ("code");