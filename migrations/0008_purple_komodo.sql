CREATE TABLE IF NOT EXISTS "Customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now(),
	"externalId" text,
	"name" text NOT NULL,
	"billing_address" jsonb NOT NULL,
	CONSTRAINT "Customers_externalId_unique" UNIQUE("externalId"),
	CONSTRAINT "Customers_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Customers_name_unique_idx" ON "Customers" USING btree ("name");