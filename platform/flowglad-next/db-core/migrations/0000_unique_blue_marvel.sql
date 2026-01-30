DO $$ BEGIN
    CREATE ROLE "authenticated";
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE OR REPLACE FUNCTION requesting_user_id()
RETURNS text AS $$
BEGIN
    RETURN NULLIF(
        current_setting('request.jwt.claims', true)::json->>'sub',
        ''
    )::text;
END;
$$ LANGUAGE plpgsql;


CREATE TABLE IF NOT EXISTS "Test" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text
);
