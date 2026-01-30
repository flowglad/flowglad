-- Custom SQL migration file, put your code below! --

-- Enforce that focusedPricingModelId belongs to the same organization as the membership
-- This is a security constraint to prevent users from being focused on a pricing model
-- that belongs to a different organization than their membership

CREATE FUNCTION enforce_focused_pm_org_match() RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
AS $$
DECLARE
    pm_org_id text;
BEGIN
    -- Skip validation if focusedPricingModelId is NULL
    IF NEW.focused_pricing_model_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Get the organizationId of the pricing model
    SELECT organization_id INTO pm_org_id
    FROM pricing_models
    WHERE id = NEW.focused_pricing_model_id;

    -- Check if pricing model exists
    IF pm_org_id IS NULL THEN
        RAISE EXCEPTION 'Pricing model % does not exist', NEW.focused_pricing_model_id;
    END IF;

    -- Check if organizations match
    IF pm_org_id <> NEW.organization_id THEN
        RAISE EXCEPTION 'focusedPricingModelId must belong to the same organization as the membership. PM org: %, Membership org: %', pm_org_id, NEW.organization_id;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_focused_pm_org_constraint_trigger
    BEFORE INSERT OR UPDATE ON memberships
    FOR EACH ROW EXECUTE FUNCTION enforce_focused_pm_org_match();

