-- Feature flags migration
-- Run in the Supabase SQL editor

CREATE TABLE feature_flags (
  key        TEXT PRIMARY KEY,
  enabled    BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed the invoices feature flag (enabled by default)
INSERT INTO feature_flags (key, enabled) VALUES ('invoices', true);

ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read flags (so the UI can react)
CREATE POLICY "authenticated read feature_flags"
  ON feature_flags FOR SELECT TO authenticated USING (true);

-- All authenticated users can update flags (admin page handles auth at the app level)
CREATE POLICY "authenticated write feature_flags"
  ON feature_flags FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
