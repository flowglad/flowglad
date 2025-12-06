-- Create function to get current auth type from JWT claims
-- Returns 'webapp' as default for backwards compatibility
CREATE OR REPLACE FUNCTION current_auth_type()
RETURNS text AS $$
BEGIN
    RETURN COALESCE(
        NULLIF(
            current_setting('request.jwt.claims', true)::json->>'auth_type',
            ''
        )::text,
        'webapp'
    );
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
ALTER POLICY "Enable read for own organizations where focused is true" ON "memberships" TO merchant USING ("user_id" = requesting_user_id() AND "organization_id" = current_organization_id() AND (current_auth_type() = 'api_key' OR "focused" = true));