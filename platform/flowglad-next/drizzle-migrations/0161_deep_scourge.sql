DO $$ BEGIN
 ALTER TABLE "customers" ADD CONSTRAINT "customers_stack_auth_user_id_users_stack_auth_id_fk" FOREIGN KEY ("stack_auth_user_id") REFERENCES "public"."users"("stack_auth_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "memberships" ADD CONSTRAINT "memberships_stack_auth_user_id_users_stack_auth_id_fk" FOREIGN KEY ("stack_auth_user_id") REFERENCES "public"."users"("stack_auth_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
