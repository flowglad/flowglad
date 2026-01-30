-- Grant DELETE permission to merchant role
GRANT DELETE ON TABLE public.api_keys TO merchant;--> statement-breakpoint

-- -- Drop the old policy that was SELECT-only
DROP POLICY IF EXISTS "Enable all actions for own organizations" ON "api_keys";--> statement-breakpoint

-- Create separate policies for each allowed operation (no UPDATE)
CREATE POLICY "Enable select for own organizations" ON "api_keys" 
  AS PERMISSIVE 
  FOR SELECT 
  TO merchant 
  USING ("organization_id" IN (SELECT "organization_id" FROM "memberships"));--> statement-breakpoint

CREATE POLICY "Enable insert for own organizations" ON "api_keys" 
  AS PERMISSIVE 
  FOR INSERT 
  TO merchant 
  WITH CHECK ("organization_id" IN (SELECT "organization_id" FROM "memberships"));--> statement-breakpoint

CREATE POLICY "Enable delete for own organizations" ON "api_keys" 
  AS PERMISSIVE 
  FOR DELETE 
  TO merchant 
  USING ("organization_id" IN (SELECT "organization_id" FROM "memberships"));--> statement-breakpoint