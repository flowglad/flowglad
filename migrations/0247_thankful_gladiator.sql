-- Ensure price slug is unique in a pricing model for active prices
-- so we can reuse a slug for editPrice
CREATE OR REPLACE FUNCTION enforce_price_slug_unique() RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
AS $$
DECLARE 
    pm text;
    cnt int;
BEGIN
    -- Early exit: if the new price is inactive, allow it
    IF NEW.active = false THEN
        RETURN NEW;
    END IF;

    -- NEW price is active, check for other active prices with same slug
    SELECT pricing_model_id INTO pm
    FROM products
    WHERE id = NEW.product_id;
    
    SELECT COUNT(*) INTO cnt
    FROM prices p
    JOIN products pr ON pr.id = p.product_id
    WHERE pr.pricing_model_id = pm
    AND p.active = true
    AND p.slug = NEW.slug
    AND (TG_OP = 'INSERT' OR p.id <> OLD.id);
    
    IF cnt > 0 THEN
        RAISE EXCEPTION 'duplicate slug "%" in pricing model %', NEW.slug, pm;
    END IF;
    
    RETURN NEW;
END;
$$;--> statement-breakpoint
