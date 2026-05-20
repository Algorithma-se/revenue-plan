-- =============================================================================
-- Algorithma Revenue Plan — Full Schema Migration
-- =============================================================================
-- Idempotent: safe to run on a fresh database or an existing one.
-- Run in Supabase SQL editor (Settings → SQL Editor).
--
-- External dependency: sales_meetings table is owned by the Sales Weekly app
-- and must already exist before the remove-item API route is used.
-- =============================================================================


-- ─── allowed_emails ───────────────────────────────────────────────────────────
-- Controls which Google accounts can log in. Add rows manually.

CREATE TABLE IF NOT EXISTS allowed_emails (
  email TEXT PRIMARY KEY
);

ALTER TABLE allowed_emails ENABLE ROW LEVEL SECURITY;

-- Only service-role key can read (used in auth callback via admin client)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'allowed_emails' AND policyname = 'allowed_emails_service_only'
  ) THEN
    CREATE POLICY "allowed_emails_service_only"
      ON allowed_emails FOR SELECT
      USING (false);  -- public/anon never reads; admin client bypasses RLS
  END IF;
END $$;


-- ─── pods ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pods (
  id   UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT    NOT NULL UNIQUE,
  sort INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE pods ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pods' AND policyname = 'pods_read') THEN
    CREATE POLICY "pods_read"  ON pods FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pods' AND policyname = 'pods_write') THEN
    CREATE POLICY "pods_write" ON pods FOR ALL    TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

INSERT INTO pods (name, sort) VALUES
  ('Pod A',                  0),
  ('Pod B',                  1),
  ('Pod C',                  2),
  ('Algorithma Technologies', 3),
  ('Other NoPod',            4)
ON CONFLICT (name) DO NOTHING;


-- ─── revenue_items ────────────────────────────────────────────────────────────
-- Synced from Sales Weekly via the push-to-plan feature.

CREATE TABLE IF NOT EXISTS revenue_items (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id   TEXT        UNIQUE NOT NULL,          -- meeting UUID from Sales Weekly
  type        TEXT        NOT NULL                   -- 'forecast' | 'booking'
                          CHECK (type IN ('forecast', 'booking')),
  client_name TEXT,
  rep_name    TEXT,
  amount      NUMERIC,                               -- total deal value in SEK
  rag_status  TEXT,
  event_date  TIMESTAMPTZ,
  synced_at   TIMESTAMPTZ DEFAULT now(),
  notes       TEXT,
  start_month DATE,                                  -- optional allocation date range
  end_month   DATE,
  pod_id      UUID        REFERENCES pods(id) ON DELETE SET NULL
);

ALTER TABLE revenue_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'revenue_items' AND policyname = 'revenue_items_read') THEN
    CREATE POLICY "revenue_items_read"  ON revenue_items FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'revenue_items' AND policyname = 'revenue_items_write') THEN
    CREATE POLICY "revenue_items_write" ON revenue_items FOR ALL    TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Columns added in later migrations — safe to re-run
ALTER TABLE revenue_items ADD COLUMN IF NOT EXISTS start_month DATE;
ALTER TABLE revenue_items ADD COLUMN IF NOT EXISTS end_month   DATE;
ALTER TABLE revenue_items ADD COLUMN IF NOT EXISTS pod_id      UUID REFERENCES pods(id) ON DELETE SET NULL;


-- ─── revenue_allocations ──────────────────────────────────────────────────────
-- Monthly breakdown of how a revenue_item's value is spread across months.

CREATE TABLE IF NOT EXISTS revenue_allocations (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  revenue_item_id UUID    NOT NULL REFERENCES revenue_items(id) ON DELETE CASCADE,
  month           DATE    NOT NULL,                  -- first of month, e.g. 2026-06-01
  amount          NUMERIC NOT NULL,                  -- SEK
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(revenue_item_id, month)
);

ALTER TABLE revenue_allocations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'revenue_allocations' AND policyname = 'allocations_read') THEN
    CREATE POLICY "allocations_read"  ON revenue_allocations FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'revenue_allocations' AND policyname = 'allocations_write') THEN
    CREATE POLICY "allocations_write" ON revenue_allocations FOR ALL    TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;


-- ─── manual_revenue_items ─────────────────────────────────────────────────────
-- Free-text revenue rows created directly in the P&L plan (not synced from Sales Weekly).

CREATE TABLE IF NOT EXISTS manual_revenue_items (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pod_id      UUID        REFERENCES pods(id) ON DELETE SET NULL,
  client_name TEXT        NOT NULL,
  project     TEXT,                                  -- optional comment / project label
  sort        INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE manual_revenue_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'manual_revenue_items' AND policyname = 'manual_rev_read') THEN
    CREATE POLICY "manual_rev_read"  ON manual_revenue_items FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'manual_revenue_items' AND policyname = 'manual_rev_write') THEN
    CREATE POLICY "manual_rev_write" ON manual_revenue_items FOR ALL    TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

ALTER TABLE manual_revenue_items ADD COLUMN IF NOT EXISTS project TEXT;


-- ─── plan_revenue_cells ───────────────────────────────────────────────────────
-- Amount + A/B/F status per (manual_revenue_item, month).

CREATE TABLE IF NOT EXISTS plan_revenue_cells (
  id                     UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  manual_revenue_item_id UUID    NOT NULL REFERENCES manual_revenue_items(id) ON DELETE CASCADE,
  month                  DATE    NOT NULL,
  amount                 NUMERIC NOT NULL DEFAULT 0,    -- SEK
  status                 TEXT    NOT NULL DEFAULT 'F'
                                 CHECK (status IN ('A', 'B', 'F')),
  UNIQUE(manual_revenue_item_id, month)
);

ALTER TABLE plan_revenue_cells ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'plan_revenue_cells' AND policyname = 'plan_rev_cells_read') THEN
    CREATE POLICY "plan_rev_cells_read"  ON plan_revenue_cells FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'plan_revenue_cells' AND policyname = 'plan_rev_cells_write') THEN
    CREATE POLICY "plan_rev_cells_write" ON plan_revenue_cells FOR ALL    TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;


-- ─── plan_allocation_statuses ─────────────────────────────────────────────────
-- A/B/F status overlay per (revenue_item, month) for synced Sales Weekly rows.
-- Amounts stay in revenue_allocations; only status is tracked here.

CREATE TABLE IF NOT EXISTS plan_allocation_statuses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  revenue_item_id UUID NOT NULL REFERENCES revenue_items(id) ON DELETE CASCADE,
  month           DATE NOT NULL,
  status          TEXT NOT NULL DEFAULT 'F'
                       CHECK (status IN ('A', 'B', 'F')),
  UNIQUE(revenue_item_id, month)
);

ALTER TABLE plan_allocation_statuses ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'plan_allocation_statuses' AND policyname = 'alloc_status_read') THEN
    CREATE POLICY "alloc_status_read"  ON plan_allocation_statuses FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'plan_allocation_statuses' AND policyname = 'alloc_status_write') THEN
    CREATE POLICY "alloc_status_write" ON plan_allocation_statuses FOR ALL    TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;


-- ─── cost_items ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cost_items (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pod_id     UUID        REFERENCES pods(id) ON DELETE SET NULL,
  category   TEXT        NOT NULL,
  comment    TEXT,                                   -- optional sub-label
  sort       INTEGER     NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE cost_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cost_items' AND policyname = 'cost_items_read') THEN
    CREATE POLICY "cost_items_read"  ON cost_items FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cost_items' AND policyname = 'cost_items_write') THEN
    CREATE POLICY "cost_items_write" ON cost_items FOR ALL    TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

ALTER TABLE cost_items ADD COLUMN IF NOT EXISTS comment TEXT;


-- ─── plan_cost_cells ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS plan_cost_cells (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  cost_item_id UUID    NOT NULL REFERENCES cost_items(id) ON DELETE CASCADE,
  month        DATE    NOT NULL,
  amount       NUMERIC NOT NULL DEFAULT 0,           -- SEK
  status       TEXT    NOT NULL DEFAULT 'F'
                       CHECK (status IN ('A', 'B', 'F')),
  UNIQUE(cost_item_id, month)
);

ALTER TABLE plan_cost_cells ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'plan_cost_cells' AND policyname = 'plan_cost_cells_read') THEN
    CREATE POLICY "plan_cost_cells_read"  ON plan_cost_cells FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'plan_cost_cells' AND policyname = 'plan_cost_cells_write') THEN
    CREATE POLICY "plan_cost_cells_write" ON plan_cost_cells FOR ALL    TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;


-- ─── plan_targets ─────────────────────────────────────────────────────────────
-- Monthly revenue targets. Rows for any fiscal year are created on first edit
-- via upsert; the seed below covers FY24/25 and FY25/26.

CREATE TABLE IF NOT EXISTS plan_targets (
  month          DATE    PRIMARY KEY,                -- first of month
  revenue_target NUMERIC NOT NULL DEFAULT 0,         -- SEK
  margin_target  NUMERIC NOT NULL DEFAULT 7          -- % (informational)
);

ALTER TABLE plan_targets ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'plan_targets' AND policyname = 'plan_targets_read') THEN
    CREATE POLICY "plan_targets_read"  ON plan_targets FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'plan_targets' AND policyname = 'plan_targets_write') THEN
    CREATE POLICY "plan_targets_write" ON plan_targets FOR ALL    TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- FY 24/25 (Aug 2024 – Jul 2025)
INSERT INTO plan_targets (month, revenue_target, margin_target) VALUES
  ('2024-08-01', 0, 7), ('2024-09-01', 0, 7), ('2024-10-01', 0, 7),
  ('2024-11-01', 0, 7), ('2024-12-01', 0, 7), ('2025-01-01', 0, 7),
  ('2025-02-01', 0, 7), ('2025-03-01', 0, 7), ('2025-04-01', 0, 7),
  ('2025-05-01', 0, 7), ('2025-06-01', 0, 7), ('2025-07-01', 0, 7)
ON CONFLICT (month) DO NOTHING;

-- FY 25/26 (Aug 2025 – Jul 2026)
INSERT INTO plan_targets (month, revenue_target, margin_target) VALUES
  ('2025-08-01', 0, 7), ('2025-09-01', 0, 7), ('2025-10-01', 0, 7),
  ('2025-11-01', 0, 7), ('2025-12-01', 0, 7), ('2026-01-01', 0, 7),
  ('2026-02-01', 0, 7), ('2026-03-01', 0, 7), ('2026-04-01', 0, 7),
  ('2026-05-01', 0, 7), ('2026-06-01', 0, 7), ('2026-07-01', 0, 7)
ON CONFLICT (month) DO NOTHING;

-- FY 26/27 (Aug 2026 – Jul 2027)
INSERT INTO plan_targets (month, revenue_target, margin_target) VALUES
  ('2026-08-01', 0, 7), ('2026-09-01', 0, 7), ('2026-10-01', 0, 7),
  ('2026-11-01', 0, 7), ('2026-12-01', 0, 7), ('2027-01-01', 0, 7),
  ('2027-02-01', 0, 7), ('2027-03-01', 0, 7), ('2027-04-01', 0, 7),
  ('2027-05-01', 0, 7), ('2027-06-01', 0, 7), ('2027-07-01', 0, 7)
ON CONFLICT (month) DO NOTHING;


-- =============================================================================
-- Done.
-- After running:
--   1. Add at least one row to allowed_emails for each user who should have access.
--   2. Configure Google OAuth in Supabase Auth → Providers.
--   3. Set the Site URL and Redirect URL to your deployment domain.
-- =============================================================================
