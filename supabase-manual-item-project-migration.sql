ALTER TABLE manual_revenue_items
  ADD COLUMN IF NOT EXISTS project TEXT;
