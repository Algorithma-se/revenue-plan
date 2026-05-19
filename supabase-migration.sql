CREATE TABLE IF NOT EXISTS revenue_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id     TEXT UNIQUE NOT NULL,   -- meeting UUID from Sales Weekly
  type          TEXT NOT NULL,          -- 'forecast' | 'booking'
  client_name   TEXT,
  rep_name      TEXT,
  amount        NUMERIC,
  rag_status    TEXT,
  event_date    TIMESTAMPTZ,
  synced_at     TIMESTAMPTZ DEFAULT now(),
  notes         TEXT
);

CREATE TABLE IF NOT EXISTS revenue_allocations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  revenue_item_id UUID REFERENCES revenue_items(id) ON DELETE CASCADE,
  month           DATE NOT NULL,          -- first day of month, e.g. 2026-06-01
  amount          NUMERIC NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(revenue_item_id, month)
);

-- RLS
ALTER TABLE revenue_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "revenue_items_read"  ON revenue_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "revenue_items_write" ON revenue_items FOR ALL    TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allocations_read"    ON revenue_allocations FOR SELECT TO authenticated USING (true);
CREATE POLICY "allocations_write"   ON revenue_allocations FOR ALL    TO authenticated USING (true) WITH CHECK (true);
