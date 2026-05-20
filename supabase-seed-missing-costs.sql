-- =============================================================================
-- Seed: Missing NoPod staff cost items (Aug 2025 – Jan 2026)
-- =============================================================================
-- Run in Supabase SQL Editor after supabase-seed-fy2526.sql.
-- Two rows omitted from the original seed:
--   Direct staff costs in pod  — Aug–Jan actuals
--   Overhead staff costs       — Aug–Nov actuals
-- =============================================================================

DO $$
DECLARE
  v_nopod UUID;
  v_item  UUID;
BEGIN
  SELECT id INTO v_nopod FROM pods WHERE name = 'Other NoPod';

  -- Direct staff costs in pod: Aug 1910, Sep 2015, Oct 1353, Nov 1360, Dec 1312, Jan 697 (kSEK)
  INSERT INTO cost_items (pod_id, category, sort) VALUES (v_nopod, 'Direct staff costs', 5) RETURNING id INTO v_item;
  INSERT INTO plan_cost_cells (cost_item_id, month, amount, status) VALUES
    (v_item, '2025-08-01', 1910000, 'A'),
    (v_item, '2025-09-01', 2015000, 'A'),
    (v_item, '2025-10-01', 1353000, 'A'),
    (v_item, '2025-11-01', 1360000, 'A'),
    (v_item, '2025-12-01', 1312000, 'A'),
    (v_item, '2026-01-01',  697000, 'A');

  -- Overhead staff costs: Aug 607, Sep 610, Oct 588, Nov 313 (kSEK)
  INSERT INTO cost_items (pod_id, category, sort) VALUES (v_nopod, 'Overhead staff costs', 6) RETURNING id INTO v_item;
  INSERT INTO plan_cost_cells (cost_item_id, month, amount, status) VALUES
    (v_item, '2025-08-01', 607000, 'A'),
    (v_item, '2025-09-01', 610000, 'A'),
    (v_item, '2025-10-01', 588000, 'A'),
    (v_item, '2025-11-01', 313000, 'A');

END $$;
