ALTER TABLE "prices" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "slug" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "products_catalog_id_slug_unique_idx" ON "products" USING btree ("catalog_id","slug");

CREATE FUNCTION enforce_price_slug_unique() RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
AS $$
DECLARE 
    cat text;
    cnt int;
BEGIN
    SELECT catalog_id INTO cat
    FROM products
    WHERE id = NEW.product_id;
    SELECT COUNT(*) INTO cnt
    FROM prices p
    JOIN products pr ON pr.id = p.product_id
    WHERE pr.catalog_id = cat
    AND p.slug = NEW.slug
    AND (TG_OP = 'INSERT' OR p.id <> OLD.id);
    IF cnt > 0 THEN
    RAISE EXCEPTION 'duplicate slug "%" in catalog %', NEW.slug, cat;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER price_slug_unique_trigger
    BEFORE INSERT OR UPDATE ON prices
    FOR EACH ROW EXECUTE FUNCTION enforce_price_slug_unique();