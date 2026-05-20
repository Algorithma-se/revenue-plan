-- =============================================================================
-- Migration: AI summary cache
-- =============================================================================
-- Stores one generated summary per calendar month (YYYY-MM).
-- Run in Supabase SQL Editor.
-- =============================================================================

CREATE TABLE IF NOT EXISTS ai_summaries (
  month        TEXT        PRIMARY KEY,   -- 'YYYY-MM'
  summary      TEXT        NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ai_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all" ON ai_summaries
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
