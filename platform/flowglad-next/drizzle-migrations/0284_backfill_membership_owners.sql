-- Backfill: Set the earliest active member of each organization as owner
-- For organizations that don't already have an owner, find the earliest
-- non-deactivated membership and set its role to 'owner'
UPDATE memberships
SET role = 'owner', updated_at = NOW()
WHERE id IN (
  SELECT DISTINCT ON (m.organization_id) m.id
  FROM memberships m
  WHERE m.deactivated_at IS NULL
    AND m.organization_id NOT IN (
      SELECT organization_id
      FROM memberships
      WHERE role = 'owner' AND deactivated_at IS NULL
    )
  ORDER BY m.organization_id, m.created_at ASC
);
