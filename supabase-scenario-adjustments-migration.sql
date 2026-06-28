-- Add scenario_adjustments column to store Allie's numeric adjustments
ALTER TABLE scenario_analyses ADD COLUMN IF NOT EXISTS scenario_adjustments jsonb;
