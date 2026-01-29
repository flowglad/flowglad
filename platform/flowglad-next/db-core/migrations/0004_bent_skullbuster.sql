CREATE TABLE IF NOT EXISTS "Countries" (
	"id" serial PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now(),
	"externalId" text,
	"name" text,
	"code" text,
	CONSTRAINT "Countries_externalId_unique" UNIQUE("externalId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Users" (
	"id" text PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now(),
	"externalId" text,
	"name" text,
	"email" text,
	CONSTRAINT "Users_id_unique" UNIQUE("id"),
	CONSTRAINT "Users_externalId_unique" UNIQUE("externalId")
);
--> statement-breakpoint
DROP TABLE "Test";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Countries_code_idx" ON "Countries" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Users_email_idx" ON "Users" USING btree ("email");