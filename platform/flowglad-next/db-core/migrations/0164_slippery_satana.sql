ALTER TABLE "users" ADD PRIMARY KEY ("stack_auth_id");
UPDATE "users" SET "id" = "stack_auth_id";--> statement-breakpoint