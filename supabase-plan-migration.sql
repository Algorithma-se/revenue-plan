-- ─── pods ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pods (
  id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  sort INTEGER NOT NULL DEFAULT 0
);

INSERT INTO pods (name, sort) VALUES
  ('Pod A', 0),
  ('Pod B', 1),
  ('Pod C', 2),
  ('Algorithma Technologies', 3),
  ('Other NoPod', 4)
ON CONFLICT (name) DO NOTHING;

ALTER TABLE pods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pods_read"  ON pods FOR SELECT TO authenticated USING (true);
CREATE POLICY "pods_write" ON pods FOR ALL    TO authenticated USING (true) WITH CHECK (true);

-- ─── revenue_items: add pod_id ───────────────────────────────────────────────
ALTER TABLE revenue_items
  ADD COLUMN IF NOT EXISTS pod_id UUID REFERENCES pods(id) ON DELETE SET NULL;

-- ─── manual_revenue_items ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS manual_revenue_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pod_id      UUID REFERENCES pods(id) ON DELETE SET NULL,
  client_name TEXT NOT NULL,
  sort        INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE manual_revenue_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "manual_rev_read"  ON manual_revenue_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "manual_rev_write" ON manual_revenue_items FOR ALL    TO authenticated USING (true) WITH CHECK (true);

-- ─── plan_revenue_cells ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plan_revenue_cells (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manual_revenue_item_id UUID NOT NULL REFERENCES manual_revenue_items(id) ON DELETE CASCADE,
  month                  DATE NOT NULL,
  amount                 NUMERIC NOT NULL DEFAULT 0,
  status                 TEXT NOT NULL DEFAULT 'F' CHECK (status IN ('A','B','F')),
  UNIQUE(manual_revenue_item_id, month)
);

ALTER TABLE plan_revenue_cells ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plan_rev_cells_read"  ON plan_revenue_cells FOR SELECT TO authenticated USING (true);
CREATE POLICY "plan_rev_cells_write" ON plan_revenue_cells FOR ALL    TO authenticated USING (true) WITH CHECK (true);

-- ─── plan_allocation_statuses ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plan_allocation_statuses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  revenue_item_id UUID NOT NULL REFERENCES revenue_items(id) ON DELETE CASCADE,
  month           DATE NOT NULL,
  status          TEXT NOT NULL DEFAULT 'F' CHECK (status IN ('A','B','F')),
  UNIQUE(revenue_item_id, month)
);

ALTER TABLE plan_allocation_statuses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "alloc_status_read"  ON plan_allocation_statuses FOR SELECT TO authenticated USING (true);
CREATE POLICY "alloc_status_write" ON plan_allocation_statuses FOR ALL    TO authenticated USING (true) WITH CHECK (true);

-- ─── cost_items ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cost_items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pod_id     UUID REFERENCES pods(id) ON DELETE SET NULL,
  category   TEXT NOT NULL,
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE cost_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cost_items_read"  ON cost_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "cost_items_write" ON cost_items FOR ALL    TO authenticated USING (true) WITH CHECK (true);

-- ─── plan_cost_cells ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plan_cost_cells (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cost_item_id UUID NOT NULL REFERENCES cost_items(id) ON DELETE CASCADE,
  month        DATE NOT NULL,
  amount       NUMERIC NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'F' CHECK (status IN ('A','B','F')),
  UNIQUE(cost_item_id, month)
);

ALTER TABLE plan_cost_cells ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plan_cost_cells_read"  ON plan_cost_cells FOR SELECT TO authenticated USING (true);
CREATE POLICY "plan_cost_cells_write" ON plan_cost_cells FOR ALL    TO authenticated USING (true) WITH CHECK (true);

-- ─── plan_targets ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plan_targets (
  month          DATE PRIMARY KEY,
  revenue_target NUMERIC NOT NULL DEFAULT 0,
  margin_target  NUMERIC NOT NULL DEFAULT 7
);

ALTER TABLE plan_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plan_targets_read"  ON plan_targets FOR SELECT TO authenticated USING (true);
CREATE POLICY "plan_targets_write" ON plan_targets FOR ALL    TO authenticated USING (true) WITH CHECK (true);

INSERT INTO plan_targets (month, revenue_target, margin_target)
VALUES
  ('2025-08-01', 0, 7), ('2025-09-01', 0, 7), ('2025-10-01', 0, 7),
  ('2025-11-01', 0, 7), ('2025-12-01', 0, 7), ('2026-01-01', 0, 7),
  ('2026-02-01', 0, 7), ('2026-03-01', 0, 7), ('2026-04-01', 0, 7),
  ('2026-05-01', 0, 7), ('2026-06-01', 0, 7), ('2026-07-01', 0, 7)
ON CONFLICT (month) DO NOTHING;
