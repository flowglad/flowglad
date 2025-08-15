ALTER TABLE "better_auth_account" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "better_auth_session" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "better_auth_user" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "better_auth_verification" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER POLICY "Enable read for own organizations" ON "memberships" RENAME TO "Enable read for own organizations where focused is true";--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'organizations'
      AND policyname = 'Enable read for own organizations'
  ) THEN
    ALTER POLICY "Enable read for own organizations" ON "organizations"
      USING (
        id IN (
          SELECT memberships.organization_id
          FROM memberships
          WHERE memberships.user_id = requesting_user_id()
            AND memberships.organization_id = current_organization_id()
        )
      );
  ELSE
    CREATE POLICY "Enable read for own organizations" ON "organizations"
      AS PERMISSIVE FOR SELECT TO "authenticated"
      USING (
        id IN (
          SELECT memberships.organization_id
          FROM memberships
          WHERE memberships.user_id = requesting_user_id()
            AND memberships.organization_id = current_organization_id()
        )
      );
  END IF;
END $$;