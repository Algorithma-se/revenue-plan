-- Stores AI-generated budget vs. P&L analyses, one per scenario per FY.
-- Upsert on re-run replaces the existing row.
CREATE TABLE IF NOT EXISTS scenario_analyses (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id  uuid        NOT NULL,
  fy_start     int         NOT NULL,
  headline     text,
  sections     jsonb,
  actions      jsonb,
  adjustments  jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scenario_id, fy_start)
);

ALTER TABLE scenario_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth users full access" ON scenario_analyses
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
