-- =============================================================================
-- Migration: Work List processed state
-- =============================================================================
-- Adds two columns to revenue_items:
--   status             — 'active' (default) or 'processed' (pushed to plan)
--   plan_manual_item_id — FK to manual_revenue_items so re-pushes update the
--                         same plan row; nulled automatically when plan row is
--                         deleted (ON DELETE SET NULL)
-- =============================================================================

ALTER TABLE revenue_items
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'processed')),
  ADD COLUMN IF NOT EXISTS plan_manual_item_id UUID
    REFERENCES manual_revenue_items(id) ON DELETE SET NULL;
