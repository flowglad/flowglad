DROP POLICY IF EXISTS "Enable all actions for discounts in own organization" ON "checkout_sessions" CASCADE;--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policy p
        JOIN pg_class c ON p.polrelid = c.oid
        WHERE c.relname = 'checkout_sessions'
        AND p.polname = 'Enable all actions for checkout_sessions in own organization'
    ) THEN
        CREATE POLICY "Enable all actions for checkout_sessions in own organization"
        ON "checkout_sessions"
        AS PERMISSIVE FOR ALL TO "merchant"
        USING ("organization_id" = current_organization_id());
    END IF;
END $$;
